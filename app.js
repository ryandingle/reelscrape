/*****************************
 File: app.js
 Creator: Louie Tanalas (ltanalas@egg.ph)
 Description:scrapes movie schedules from non-ayala sources.
 Response: JSON Object of movie schedules
******************************/

var newrelic = require('newrelic');

var restify = require('restify'),
    address = require('address'),
    webscraper = require('./scraper');

var scraper = restify.createServer({
    name: "reelscrape"
});

var api_version_1 = '0.0.2';
var server_ip = address.ip(); //change this accordingly to get server ip
var server_port = Number(process.env.PORT || 4000);

scraper.use(restify.queryParser());
scraper.use(restify.bodyParser());

scraper.get({
    path: '/fetch/:code/:mode',
    version: api_version_1
}, webscraper.fetchdata);

scraper.get({
    path: '/fetchall',
    version: api_version_1
}, webscraper.fetchall);

scraper.get({
    path: '/cron',
    version: api_version_1
}, webscraper.cron);

scraper.get({
    path: '/download-csv',
    version: api_version_1
}, webscraper.downloadcsv);

scraper.get('/fill', webscraper.filldummy);

/* Client Side Route */
scraper.get('/', restify.serveStatic({
    directory: 'public',
    default: 'index.html'
}));

scraper.get('/assets/.*', restify.serveStatic({
    directory: 'public'
}));

scraper.get('/pong', function respond(req, res, next) {
    res.send(201, {
        hello: 'world'
    });
    console.log('sent ping response...')
    return next();
});
scraper.listen(server_port, server_ip, function() {
    console.log("%s magic happens here at %s", scraper.name, scraper.url);
    console.log("running at eth01 ip " + server_ip);
});
