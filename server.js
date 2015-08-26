
/**
* Module dependencies.
*/

var express = require('express')
, http = require('http')
, path = require('path');

var exphbs  = require('express-handlebars');

var app = express();


var devEnv = app.get('env') === 'development';

var staticDir = path.join(__dirname, 'public');
var assetsDir = path.join(__dirname, 'builtAssets');
var assetsUrl = devEnv ? '/' : '/assets';
var maxAge = 86400000; // one day

var assets = {
  'test.js' : {
    type: 'js',
    dir: 'js',
    files: [
      'one.js',
      'two.js' 
    ]
  }
};

var assetManagerConfig = {
  rootRoute: assetsUrl,
  srcDir: staticDir,
  buildDir: assetsDir,
  process: true
};

app.configure(function(){
  app.set('port', process.env.PORT || 3000);

  app.engine('handlebars', exphbs({defaultLayout: 'main'}));
  app.set('view engine', 'handlebars');

  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  
  app.use(require("express-asset-manager")(assets, assetManagerConfig));
  
  app.use(app.router);

  if (!devEnv) app.use(assetsUrl, 
    express.static(assetsDir, { maxAge: maxAge })
  );
  
  app.use(express.static(staticDir));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});



var connectionString = process.env['SQLAZURECONNSTR_DefaultConnection'];
var NZDB = require('./backend/nzdb');
var db = new NZDB(connectionString);



app.get('/', function (req, res) {  
  res.render('home', {
    title: "bumpy"
  });
});





app.get('/noodlefactory', function (req, res) {
  console.log(res.locals);
  
  db.getElicitationFromID(97, function (err, results) {
    res.render('noodlefactory', {
      results: JSON.stringify(results),
      asset: res.locals.asset
    });
  });
});

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
