var express = require('express');
var router = express.Router();

var Handlebars = require('handlebars');

var elicitationViewModel = require('./elicitation/view-model');
var includeStatic = require('./elicitation/static-includes');
var authenticateAccessTo = require('./elicitation/auth');

var Promise = require('bluebird');
// FIXME: should only use in dev, not prod
Promise.longStackTraces();

module.exports = function (db, assetHelpers) {

  router.get('/run/:id/:humanreadable?', function (req, res) {
    elicit(req, res, "Elicitation.View+");
  });
  
  router.get('/edit/:id/:humanreadable?', function (req, res) {
    elicit(req, res, "Elicitation.Edit+", { 
      startEditing: true,
      modifyViewModel: function (viewModel) {
        /*
        if (revision != null) {
            var definition = db.ElicitationDefinitions.Find(revision);

            if (!elicitation.DefinitionHistory.Contains(definition)) throw new Exception("Specified definitionID " + revision + " is not in the history of elicitation");
            elicitationViewModel.elicitationDefinition = definition.Definition;
            elicitationViewModel.settings.notTheLatestRevision = true;
        }*/
        console.log("Modifying view model!");
        return viewModel;
      }
    });
  }); 
  
  function addLogEntry(method, text) {
    console.log("FIXME addLogEntry not implemented: ", method, text);
    return Promise.resolve();
  }
  
  router.post('/savedefinition/:id/:humanreadable?', function (req, res) {
    var now = Date.now();
        
    // URL / Query params:
    var elicitationID = parseInt(req.params.id);
    var changeSummary = req.body.ChangeSummary;
    var definitionText = req.body.ElicitationDefinition;    
    
    var SaveAsNewElicitation = req.body.SaveAsNewElicitation == "true";
    var SaveAsNewElicitationname = req.body.SaveAsNewElicitationName;    
    console.warn("FIXME: elicitation.savedefinition.SaveAsNewElicitation is not implemented");    
    if (SaveAsNewElicitation) {
      throw "SaveAsNewElicitation is not implemented";
      /* FIXME: TO IMPLEMENT:
            if (SaveAsNewElicitation) {
                var oldElicitation = elicitation;
                elicitation = (Elicitation)oldElicitation.Clone(db, db);
                elicitation.ElicitationName = SaveAsNewElicitationName;
                db.SaveChanges();
            }
      */
    }
    
    console.warn("FIXME: validate moderator");
        
    addLogEntry("Elicitation.SaveDefinition", "ElicitationID: " + elicitationID)
    .then( () => authenticateAccessTo(elicitationID, req, res) )
    .then(personID =>
      Promise.all([
        db.getElicitation(elicitationID),
        db.getElicitationAssignment(elicitationID, personID),
        personID
      ])
    )
    .spread( (elicitation, assignment, personID) =>
      db.getDiscussionMembership(elicitation.Discussion_ID, personID)
      .then( (membership) =>
        db.transaction(function (t) {
          return db.models.ElicitationDefinition.create({
            Definition: definitionText,
            ChangeSummary: changeSummary,
            Elicitation_ID: elicitationID,
            Created: now,
            Modified: now,
            CreatedBy_ID: personID
          }, {transaction: t}).then( newDefinition => {
            elicitation.ElicitationDefinition_ID = newDefinition.ID;
            elicitation.Modified = now;
            
            return elicitation.save({transaction: t})
            .then( () =>
              db.models.Discussion.update( 
                { LastActivity: now },
                { where: { ID: elicitation.Discussion_ID }, transaction: t }
              )
            )
          });
        }).then( function () {
          console.warn("FIXME: updating per widget results not yet implemented");
          /* FIXME TO IMPLEMENT:
            foreach (var perWidgetResult in elicitation.PerWidgetResults) {
                perWidgetResult.UpdateFromElicitationDefinition(dbRequiredForDeleting: this.db);
            }
            db.SaveChanges();
          */
        })
      )
    ).then(function () {
      console.log("SaveDefinition succeeded!");
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(true));
    });
  });

  /* Accepts JSON data submissions from Expert participants, including page-by-page 'backup' submissions,
  * which will have completed=false, and the final data submit, which will have completed=true */
  router.post('/savedata/:id/:humanreadable?', function (req, res) {

    /* FIXME: todo
            Trace.TraceInformation("ElicitationController.SaveData on id: " + id + " from personID: " + person.ID);

            this.addLogEntry("Elicitation.SaveData", Text: "ElicitationID: " + id);
            db.SaveChanges();
    */

    // URL / Query params:
    var elicitationID = parseInt(req.params.id);
    var elicitation_definition_id = parseInt(req.body.elicitation_definition_id);    
    var ElicitationCompleted = req.body.completed == "true";
    var json = req.body.json;
    
    //console.log("Params are: ", JSON.stringify(req.body));
    
    var now = Date.now();
    
    console.warn("FIXME: validate moderator");    
    
    addLogEntry("Elicitation.SaveData", "ElicitationID: " + elicitationID)
    .then( () => authenticateAccessTo(elicitationID, req, res) )
    .then(personID =>
      Promise.all([
        db.getElicitation(elicitationID),
        db.getElicitationAssignment(elicitationID, personID),
        personID
      ])
    )
    .spread( (elicitation, assignment, personID) =>
      db.getDiscussionMembership(elicitation.Discussion_ID, personID)
      .then( function (membership) {
        return db.transaction(function (t) {

          membership.LastAccessed = now;            
          assignment.LastAccessed = now;
          assignment.Modified = now;
      
          return db.models.ElicitationData.create({
            ElicitationTask_ID: assignment.ID, // FIXME: sequelize association
            JSON: '',//json,
            Completed: ElicitationCompleted,
            Created: now,
            Modified: now,
            ElicitationDefinition_ID: elicitation_definition_id,
            BrowserUserAgent: req.headers['user-agent']
          }, {transaction: t}).then( function (elicitationData) {
            if (ElicitationCompleted) {                
              assignment.CompletedElicitationData_ID = elicitationData.ID;
              assignment.Completed = true;
          
              membership.HasParticipated = true;
              membership.HasCompletedTask = true;
              elicitation.lastCompleted = now;
              membership.LastParticipated = now;

              return addLogEntry("Elicitation Complete", "ElicitationID: " + elicitationID)
              .then( () => db.updateNumAssignedAndCompletedFromDB(elicitation, t) )
              .then( () => membership.save({transaction: t}) )                
              .then( () => assignment.save({transaction: t}) )
              .then( () => elicitation.save({transaction: t}) )
              .then( () =>
                db.models.Discussion.update( 
                  { LastActivity: now },
                  { where: { ID: elicitation.Discussion_ID }, transaction: t }
                )
              )
            } else {
              return membership.save({transaction: t})
              .then( () => assignment.save({transaction: t}) );
            }
          });

        }).then(function () {
          // update per-widget results
          if (ElicitationCompleted) {
            console.warn("FIXME: not updating per-widget results as per ElicitationController.cs");
            /* FIXME TO IMPLEMENT
                if (ElicitationCompleted) {
                    // Update Per-Widget Results
                    try {
                        foreach (var perWidgetResults in elicitation.PerWidgetResults) {
                            perWidgetResults.AddElicitationData(elicitationData);
                        }
                        db.SaveChanges();
                    } catch (Exception e) {
                        // FIXME: log exception
                        Trace.TraceError("ElicitationController.SaveData: error updating per-widget results\n" + e.ToString());
                        var message = e.Message;
                    }

                    // Email the moderators, let them know an expert submitted an elicitation
                    try {
                        var domainName = NearZero.Models.NZConfiguration.DomainName;
                        if (domainName != "127.0.0.1") {
                            var formattedJSON = JObject.Parse(json).ToString();

                            string elicitationName = elicitation.ElicitationName;

                            var message = new MailMessage {
                                From = elicitation.Discussion.getMailAddress(domainName),
                                Subject = "Elicitation Completed (" + elicitationName.ToString() + ")",
                                Body = person.name + " completed the elicitation"
                            };
                            foreach (var moderator in elicitation.Discussion.Moderators) {
                                message.To.Add(new MailAddress(moderator.email, moderator.name));
                            }
                            MessageSender.SendMailMessage(message);
                            //AmazonSES.send(message);
                        }
                    } catch (Exception e) {
                        Trace.TraceError("ElicitationController.SaveData: error sending moderators a message\n" + e.ToString());
                    }

                    Trace.TraceInformation("ElicitationController.SaveData: complete submission from " + person.ID);
                }
            */
          }
        });
      })
    )    
    .then(function () {
      console.log("SaveData Success!");
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(true));      
    })
    .catch(function (e) {
      console.warn("FIXME: to implement exception logging and handling in savedata");
      /* FIXME TO IMPLEMENT
            } catch (Exception ex) {
                var exString = ex.ToString();
                Trace.TraceError("ElicitationController.SaveData: error \n" + exString);

                this.addLogEntry("Elicitation.SaveData ERROR", Text: "ElicitationID: " + id + "\nException:\n" + exString + "\n");
                db.SaveChanges();
                throw ex;
            }
      */
    });   
  });

  function renderElicitation(req, res, models, logName, startEditing, embedded, modifyViewModel) {
    return elicitationViewModel(db, models, logName, startEditing, embedded)
    .then(modifyViewModel)
    .then(viewModel => {
      viewModel.helpers = {
        includeStatic: function(filename) { return new Handlebars.SafeString(includeStatic(filename)); },
        css: function(filename) { return new Handlebars.SafeString(assetHelpers.css(filename)); },
        js: function(filename) { return new Handlebars.SafeString(assetHelpers.js(filename)); },
        assetPath: function(filename) { return new Handlebars.SafeString(assetHelpers.assetPath(filename)); },
        jsonStringify: function(obj) { return new Handlebars.SafeString(JSON.stringify(obj)); }
      };
      viewModel.layout = false;
          
      res.render('elicitation-backend-layout', viewModel);
    });
  }
  

  function elicit(req, res, logName, options) {
    var options = options || {};
    var startEditing = options.startEditing != undefined ? options.startEditing : false;
    var embedded = options.embedded != undefined ? options.embedded : false;
    var modifyViewModel = options.modifyViewModel || function (viewModel) { return viewModel; };
    
    var elicitationID = parseInt(req.params.id);
    console.log(logName + "(" + elicitationID + ")");

    return authenticateAccessTo(elicitationID, req, res)
    .then(
      personID => db.getElicitationAndAssets(elicitationID, personID)
    )
    .then(
      models => renderElicitation(req, res, models, "Elicitation.View+", startEditing, embedded, modifyViewModel)
    ).catch(authenticateAccessTo.RedirectToLoginError, 
      redirect => res.redirect(redirect.url)
    );
    
  } 
  
  return router;
}
