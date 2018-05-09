var Theater = require("./dbconfig").Theater,
    Scraper = require("./class.js").Scraper,
    async = require("async"),
    scrapeutils = require("./utils"),
    json2csv = require("nice-json2csv"),
    _ = require("underscore");
    Client = require('node-rest-client').Client;

var scraper = new Scraper();

function scrape_and_flush(t, res, mode) {

    //called by cron?
    var is_cron = (mode === undefined) ? false : true;
    console.log('CRON Triggered: ' + is_cron);

    var sendOut = function(d) {

        if (is_cron) {
            console.log("Pushing to backend...");
            console.log('Data pushed: ' + JSON.stringify(scrapeutils.transform(d)));

            // set content-type header and data as json in args parameter
            var args = {
                data: JSON.stringify(scrapeutils.transform(d)),
                headers: {
                    "Content-Type": "application/json"
                }
            };

            var client = new Client();

            client.post("http://54.254.238.125/endpoints/scrape/getScheds", args, function(data, response) {
                console.log(data);
            }).on('error', function(err) {
                console.error('Something went wrong on GMovies.ph (production) schedules reciever ', err);
            }).on('success', function(d) {
                console.log('Successfully transfered data to GMovies.ph (production)', d);
            });

            client.post("http://gmoviespromo.com/npdmovies/endpoints/scrape/getScheds", args, function(data, response) {
                console.log(data);
            }).on('error', function(err) {
                console.error('Something went wrong on GMoviespromo.com (staging) schedules reciever ', err);
            }).on('success', function(d) {
                console.log('Successfully transfered data to GMoviespromo.com (staging) ', d);
            });


        } else {
            console.log("Flushing out...");
            res.send(scrapeutils.transform(d));
        }
    };

    console.log('Scraping ' + t.name);
    switch (t.callback) {
        case "scrapeSM":
            scraper.scrapeSM(t.code, sendOut);
            break;
        case "scrapeGreenhills":
            scraper.scrapeGreenhills(t.code, sendOut);
            break;
        case "scrapeMegaworld":
            scraper.scrapeMegaworld(t.code, sendOut);
            break;
        case "scrapeFestival":
            scraper.scrapeFestival(t.code, sendOut);
            break;
        case "scrapeGateway":
            scraper.scrapeGateway(t.code, sendOut);
            break;
        case "scrapeRockwellPP":
            scraper.scrapeRockwellPP(t.code, sendOut);
            break;
        case "scrapeShang":
            scraper.scrapeShang(t.code, sendOut);
            break;
        case "scrapeRobinsons":
            scraper.scrapeRobinsons(t.code, sendOut);
            break;
        case "scrapeAyalaMalls":
            scraper.scrapeAyalaMalls(t.code, sendOut);
            break;
        case "scrapeClickTheCity":
            scraper.scrapeClickTheCity(t.ctc_theaters, t.code, sendOut);
            break;
        default:
            //res.send({
            //    message: "Error, can't find matching callback for the theater code"
            //});
            console.log("Error, can't find matching callback for the theater code");
            break;
    }
}


function downloadcsv(req, res, next){

    var zero_prefix_cinemas = function(callback){

        var payload = JSON.parse(decodeURIComponent(req.query.payload));
        //console.log("Initial Payload:" + payload);
        var isNumber = function(n){
            return /^\+?(0|[1-9]\d*)$/.test(n);
        }

        var getNum = function(n){
            if(isNumber(n)){
                return parseInt(n);
            }
        }

        var tcode = payload[0][1];
        console.log("Tcode: " + tcode);
        var q = Theater.findOne({ "code" : tcode });
        q.exec(function(err, theater){
                if (err) console.log("Mongodb error:" + err);
                console.log("Prefix Status: " + theater.zero_prefix);
                if(theater.zero_prefix){
                    console.log("Is prefixible");
                    var prefixed_payload =  _.map(payload, function(el) {
                         if(getNum(el[2]) < 10) {
                             el[2] = '0' + el[2].toString();
                             return el;
                         }
                         return el;
                     });
                     callback(null, prefixed_payload);
                } else {
                    console.log("Not prefixible");
                    callback(null, payload);    
                }
        });
    }

    var combine_date_time = function(payload, callback){
        //console.log("zero_prefixed: " + payload);
        updated_payload = _.map(payload, function(p){
            var price = p[5];
            var variant = p[6];

            p[3] = p[3] + ' ' + p[4];
            p[4] = price;
            p[5] = variant;
            p = p.splice(0,6);
            //console.log("Spliced: " + p);
            return p;
        });
        //console.log("Updated data: " + updated_payload);
        callback(null, updated_payload);
    }

    console.log("Downloading CSV");
    
    async.waterfall([zero_prefix_cinemas, combine_date_time], function(err, results){
        if(err){ console.log("Waterfall error: "+ err); }
        console.log("Filtered Results: " + results + ' '+ typeof results);
    
        // //convert to csv string with headers stripped 
        var csvdata =  json2csv.convert(results,[0,1,2,3,4,5],true);
        console.log("CSV data: " + csvdata);
  
        var filename = 'GMovies_SCHED_' + results[0][1] + '.csv'; 
        console.log(filename);
        res.setHeader('Content-disposition', 'attachment; filename=' + filename);
        res.writeHead(200, {
             'Content-Type': 'text/csv'
        });

        res.end(csvdata);
        next();        //res.end("Hello");
    });

}

function cron(req, res, next) {
    console.log('Token recieved: ' + req.query.token);
    if (req.query.token == 'hcd8jrblo9i5ghqa7') {
        // Find theaters with callbacks not equal to Click The City and code
        // not equal to (GWY) Gateway Mall and (EWCW, EWLCT, EWM, NMRW) for Megaworld theaters
        Theater.find({
            callback: {
                '$ne': 'scrapeClickTheCity',
            },
            code: {
                '$nin': ['GWY', 'EWCW', 'EWLCT', 'EWM', 'NMRW']
            }
        }, function(err, theaters) {
            if (err) {
                console.log(err);
            }
            console.log('Theater count: ' + theaters.length);

            async.each(theaters, function(t, cb) {
                console.log('==> Processing async scrape for theaters in ' + t.name);
                scrape_and_flush(t, res, true);
            });
        });

        // Special query for Gateway Mall and Megaworld theaters
        // Query from Click The City instead of Gateway Malls erratic portal
        Theater.find({
            callback: 'scrapeClickTheCity',
            code: { '$in':['GWYCTC', 'EWCWCTC', 'EWLCTCTC', 'EWMCTC', 'NMRWCTC']}
        }, function(err, theaters) {
            if (err) {
                console.log(err);
            }
            console.log('Theater count: ' + theaters.length);
            async.each(theaters, function(t, cb) {
                console.log('==> Processing async scrape for theaters in ' + t.name);
                scrape_and_flush(t, res, true);
            });

        });

        res.send({
            status: 'ok',
            msg: 'Auto push has started'
        });

    } else {
        console.log('Invalid request token.');
        res.send({
            status: 'failed',
            msg: 'Invalid Token'
        });
    }
}

function fetchdata(req, res, next) {
    var theatercode = req.params["code"];
    var mode = req.params["mode"];

    console.log("Theater code_name: " + theatercode);
    console.log("fetching from database...");

    theatercode = (mode == "CTC") ? theatercode + mode : theatercode;

    Theater.findOne({
        "code": theatercode
    }, function(err, t) {
        if (err) {
            return console.err(err);
        }
        //call function
        console.log("Matching record found. Code: " + t.code + " Callback: " + t.callback);
        scrape_and_flush(t, res);
    });
    next();
}


function filldummy(req, res, next) {
    var td = [{
            name: "SM Aura",
            code: "SMAU",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Bacolod",
            code: "SMBD",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Bacoor",
            code: "SMCB",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Baguio",
            code: "SMBG",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Baliwag",
            code: "SMBL",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Batangas",
            code: "SMBA",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM BF Paranaque",
            code: "SMBF",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Bicutan",
            code: "SMBT",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Calamba",
            code: "SMCL",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Cauayan",
            code: "SMCA",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Cagayan de Oro",
            code: "SMCDO",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Cebu",
            code: "SMCEB",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Clark",
            code: "SMCLA",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Consolacion",
            code: "SMCON",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Dasmarinas",
            code: "SMDM",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Davao",
            code: "SMDAV",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Fairview",
            code: "SMCF",
            callback: "scrapeSM",
            zero_prefix: true
        }, {
            name: "SM General Santos",
            code: "SMGS",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Iloilo",
            code: "SMCI",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Lanang",
            code: "SMDLA",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Lipa",
            code: "SMLP",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Lucena",
            code: "SMLC",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Mall of Asia",
            code: "SMMOA",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Manila",
            code: "SMCM",
            callback: "scrapeSM",
            zero_prefix: true
        }, {
            name: "SM Marikina",
            code: "SMMK",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Marilao",
            code: "SMMR",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Masinag",
            code: "SMMS",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Megamall",
            code: "SMMM",
            callback: "scrapeSM",
            zero_prefix: true
        }, {
            name: "SM Molino",
            code: "SMML",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Muntinlupa",
            code: "SMMT",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Naga",
            code: "SMNG",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM North Edsa",
            code: "SMNE",
            callback: "scrapeSM",
            zero_prefix: true
        }, {
            name: "SM Novaliches",
            code: "SMNV",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Olongapo",
            code: "SMOLO",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Podium",
            code: "SMKL",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Pampanga",
            code: "SMPAM",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Rosales",
            code: "SMRS",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Rosario",
            code: "SMRO",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM San Fernando",
            code: "SMSFP",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM San Lazaro",
            code: "SMSL",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM San Pablo",
            code: "SMPB",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM South Mall",
            code: "SMSTH",
            callback: "scrapeSM",
            zero_prefix: true
        }, {
            name: "SM Sta. Mesa",
            code: "SMST",
            callback: "scrapeSM",
            zero_prefix: true
        }, {
            name: "SM Sta. Rosa",
            code: "SMSR",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Sucat",
            code: "SMSC",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Taytay",
            code: "SMTT",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Tarlac",
            code: "SMTL",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "SM Valenzuela",
            code: "SMVL",
            callback: "scrapeSM",
            zero_prefix: false
        }, {
            name: "Greenhills Atmos",
            code: "GHA",
            callback: "scrapeGreenhills",
            zero_prefix: false
        }, {
            name: "Greenhills Promenade",
            code: "GHP",
            callback: "scrapeGreenhills",
            zero_prefix: false
        }, {
            name: "Greenhills Theater",
            code: "GHT",
            callback: "scrapeGreenhills",
            zero_prefix: false
        }, {
            name: "Megaworld - Eastwood Citywalk",
            code: "EWCW",
            callback: "scrapeMegaworld",
            zero_prefix: false
        }, {
            name: "Megaworld - Lucky Chinatown",
            code: "EWLCT",
            callback: "scrapeMegaworld",
            zero_prefix: false
        }, {
            name: "Megaworld - Eastwood Mall",
            code: "EWM",
            callback: "scrapeMegaworld",
            zero_prefix: false
        }, {
            name: "Megaworld - Newport Mall",
            code: "NMRW",
            callback: "scrapeMegaworld",
            zero_prefix: false
        }, {
            name: "Festival Mall",
            code: "FSA",
            callback: "scrapeFestival",
            zero_prefix: true
        }, {
            name: "Gateway Mall",
            code: "GWY",
            callback: "scrapeGateway",
            zero_prefix: true
        }, {
            name: "Power Plant Mall",
            code: "RWPP",
            callback: "scrapeRockwellPP",
            zero_prefix: false
        }, {
            name: "Shangri-la Mall, Edsa",
            code: "SHANG",
            callback: "scrapeShang",
            zero_prefix: false
        }, {
            name: "Robinsons Galleria",
            code: "RMGAL",
            callback: "scrapeRobinsons",
            zero_prefix: true
        }, {
            name: "Robinsons Magnolia",
            code: "RMMAG",
            callback: "scrapeRobinsons",
            zero_prefix: false
        }, {
            name: "Robinsons Manila",
            code: "RMMNL",
            callback: "scrapeRobinsons",
            zero_prefix: false
        }, {
            name: "Robinsons Starmills",
            code: "RMSTM",
            callback: "scrapeRobinsons",
            zero_prefix: false
        }, {
            name: "Glorietta 4",
            code: "G4",
            callback: "scrapeAyalaMalls",
            zero_prefix: false
        }, {
            name: "Greenbelt 1",
            code: "GB1",
            callback: "scrapeAyalaMalls",
            zero_prefix: false
        }, {
            name: "Greenbelt 3",
            code: "GB3",
            callback: "scrapeAyalaMalls",
            zero_prefix: false
        }, {
            name: "Alabang Town Center",
            code: "ATC",
            callback: "scrapeAyalaMalls",
            zero_prefix: false
        }, {
            name: "Ayala Cebu Center",
            code: "ACC",
            callback: "scrapeAyalaMalls",
            zero_prefix: false
        }, {
            name: "Market! Market!",
            code: "M2",
            callback: "scrapeAyalaMalls",
            zero_prefix: false
        }, {
            name: "Trinoma",
            code: "TRI",
            callback: "scrapeAyalaMalls",
            zero_prefix: false
        }, {
            name: "Marquee",
            code: "MRQ",
            callback: "scrapeAyalaMalls",
            zero_prefix: false
        }, {
            name: "Abreeza",
            code: "ABRZ",
            callback: "scrapeAyalaMalls",
            zero_prefix: false
        }, {
            name: "Harbor Point",
            code: "HPC",
            callback: "scrapeAyalaMalls",
            zero_prefix: false
        }, {
            name: "Centrio",
            code: "CMC",
            callback: "scrapeAyalaMalls",
            zero_prefix: false
        }, {
            name: "Fairview Terraces",
            code: "FTC",
            callback: "scrapeAyalaMalls",
            zero_prefix: false
        }, {
            name: "Bonifacio High Street",
            code: "BHS",
            callback: "scrapeAyalaMalls",
            zero_prefix: false
        },

        //Click the City

        {
            name: "SM Aura via Click The City",
            code: "SMAUCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-aura-premier', ],
            zero_prefix: false
        }, {
            name: "SM Bacolod via Click The City",
            code: "SMBDCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-bacolod', ],
            zero_prefix: false
        }, {
            name: "SM Bacoor via Click The City",
            code: "SMCBCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-bacoor', ],
            zero_prefix: false
        }, {
            name: "SM Baguio via Click The City",
            code: "SMBGCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-baguio', ],
            zero_prefix: false
        }, {
            name: "SM Baliwag via Click The City",
            code: "SMBLCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-baliwag', ],
            zero_prefix: false
        }, {
            name: "SM Batangas via Click The City",
            code: "SMBACTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-batangas', ],
            zero_prefix: false
        }, {
            name: "SM BF Paranaque via Click The City",
            code: "SMBFCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-bf-paranaque', ],
            zero_prefix: false
        }, {
            name: "SM Bicutan via Click The City",
            code: "SMBTCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-bicutan', ],
            zero_prefix: false
        }, {
            name: "SM Cagayan de Oro via Click The City",
            code: "SMCDOCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-cagayan-de-oro', ],
            zero_prefix: false
        }, {
            name: "SM Calamba via Click The City",
            code: "SMCLCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-calamba', ],
            zero_prefix: false
        }, {
            name: "SM Cauayan via Click The City",
            code: "SMCACTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-cauayan', ],
            zero_prefix: false
        }, {
            name: "SM Cebu via Click The City",
            code: "SMCEBCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-cebu', ],
            zero_prefix: false
        }, {
            name: "SM Clark via Click The City",
            code: "SMCLACTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-clark', ],
            zero_prefix: false
        }, {
            name: "SM Consolacion via Click The City",
            code: "SMCONCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-consolacion', ],
            zero_prefix: false
        }, {
            name: "SM Dasmarinas via Click The City",
            code: "SMDMCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-dasmarinas', ],
            zero_prefix: false
        }, {
            name: "SM Davao via Click The City",
            code: "SMDAVCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-davao', ],
            zero_prefix: false
        }, {
            name: "SM Fairview via Click The City",
            code: "SMCFCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-fairview', ],
            zero_prefix: true
        }, {
            name: "SM General Santos via Click The City",
            code: "SMGSCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-general-santos', ],
            zero_prefix: false
        }, {
            name: "SM Iloilo via Click The City",
            code: "SMCICTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-iloilo', ],
            zero_prefix: false
        }, {
            name: "SM Lipa via Click The City",
            code: "SMLPCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-lipa', ],
            zero_prefix: false
        }, {
            name: "SM Lucena via Click The City",
            code: "SMLCCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-lucena', ],
            zero_prefix: false
        }, {
            name: "SM Lanang via Click The City",
            code: "SMDLACTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-lanang-premier', ],
            zero_prefix: false
        }, {
            name: "SM Mall of Asia via Click The City",
            code: "SMMOACTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-mall-of-asia', 'sm-imax-cinema'],
            zero_prefix: false
        }, {
            name: "SM Manila via Click The City",
            code: "SMCMCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-manila', ],
            zero_prefix: true
        }, {
            name: "SM Marikina via Click The City",
            code: "SMMKCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-marikina', ],
            zero_prefix: false
        }, {
            name: "SM Marilao via Click The City",
            code: "SMMRCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-marilao', ],
            zero_prefix: false
        }, {
            name: "SM Masinag via Click The City",
            code: "SMMSCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-masinag', ],
            zero_prefix: false
        }, {
            name: "SM Molino via Click The City",
            code: "SMMLCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-molino', ],
            zero_prefix: false
        }, {
            name: "SM Megamall via Click The City",
            code: "SMMMCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-megamall', ],
            zero_prefix: true
        }, {
            name: "SM Muntinlupa via Click The City",
            code: "SMMTCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-supercenter-muntinlupa', ],
            zero_prefix: false
        }, {
            name: "SM Naga via Click The City",
            code: "SMNGCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-naga', ],
            zero_prefix: false
        }, {
            name: "SM North Edsa via Click The City",
            code: "SMNECTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-north-edsa-the-block', 'sm-city-north-edsa'],
            zero_prefix: true
        }, {
            name: "SM Novaliches via Click The City",
            code: "SMNVCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-novaliches', ],
            zero_prefix: false
        }, {
            name: "SM Olongapo via Click The City",
            code: "SMOLOCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-olongapo', ],
            zero_prefix: false
        }, {
            name: "SM Podium via Click The City",
            code: "SMKLCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['the-podium', ],
            zero_prefix: false
        }, {
            name: "SM Pampanga via Click The City",
            code: "SMPAMCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-pampanga', ],
            zero_prefix: false
        }, {
            name: "SM Rosales via Click The City",
            code: "SMRSCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-rosales', ],
            zero_prefix: false
        }, {
            name: "SM Rosario via Click The City",
            code: "SMROCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-rosario', ],
            zero_prefix: false
        }, {
            name: "SM San Fernando via Click The City",
            code: "SMSFPCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-san-fernando', ],
            zero_prefix: false
        }, {
            name: "SM San Lazaro via Click The City",
            code: "SMSLCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-san-lazaro', ],
            zero_prefix: false
        }, {
            name: "SM San Pablo via Click The City",
            code: "SMPBCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-san-pablo', ],
            zero_prefix: false
        }, {
            name: "SM South Mall via Click The City",
            code: "SMSTHCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-southmall', ],
            zero_prefix: true
        }, {
            name: "SM Sta. Mesa via Click The City",
            code: "SMSTCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-sta-mesa', ],
            zero_prefix: true
        }, {
            name: "SM Sta. Rosa via Click The City",
            code: "SMSRCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-sta-rosa', ],
            zero_prefix: false
        }, {
            name: "SM Sucat via Click The City",
            code: "SMSCCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-sucat', ],
            zero_prefix: false
        }, {
            name: "SM Taytay via Click The City",
            code: "SMTTCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-taytay', ],
            zero_prefix: false
        }, {
            name: "SM Tarlac via Click The City",
            code: "SMTLCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-city-tarlac', ],
            zero_prefix: false
        }, {
            name: "SM Valenzuela via Click The City",
            code: "SMVLCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['sm-valenzuela', ],
            zero_prefix: false
        }, {
            name: "Greenhills Atmos via Click The City",
            code: "GHACTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['greenhills-dolby-atmos', ],
            zero_prefix: false
        }, {
            name: "Greenhills Promenade via Click The City",
            code: "GHPCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['greenhills-promenade', ],
            zero_prefix: false
        }, {
            name: "Greenhills Theater via Click The City",
            code: "GHTCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['greenhills-theatre-mall', ],
            zero_prefix: false
        }, {
            name: "Megaworld - Eastwood Citywalk via Click The City",
            code: "EWCWCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['eastwood-citywalk-2', ],
            zero_prefix: false
        }, {
            name: "Megaworld - Lucky Chinatown via Click The City",
            code: "EWLCTCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['lucky-chinatown-mall', ],
            zero_prefix: false
        }, {
            name: "Megaworld - Eastwood Mall via Click The City",
            code: "EWMCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['eastwood-mall', ],
            zero_prefix: false
        }, {
            name: "Megaworld - Newport Mall via Click The City",
            code: "NMRWCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['newport-mall', ],
            zero_prefix: false
        }, {
            name: "Festival Mall via Click The City",
            code: "FSACTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['festival-supermall', ],
            zero_prefix: true
        }, {
            name: "Gateway Mall via Click The City",
            code: "GWYCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['gateway-mall', ],
            zero_prefix: true
        }, {
            name: "Power Plant Mall via Click The City",
            code: "RWPPCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['power-plant-mall', ],
            zero_prefix: false
        }, {
            name: "Shangri-la Mall, Edsa via Click The City",
            code: "SHANGCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['shangri-la-plaza-mall', ],
            zero_prefix: false
        }, {
            name: "Robinsons Galleria via Click The City",
            code: "RMGALCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['robinsons-galleria', ],
            zero_prefix: true
        }, {
            name: "Robinsons Magnolia via Click The City",
            code: "RMMAGCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['robinsons-magnolia', ],
            zero_prefix: false
        }, {
            name: "Robinsons Manila via Click The City",
            code: "RMMNLCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['robinsons-place-manila', ],
            zero_prefix: false
        }, {
            name: "Robinsons Starmills via Click The City",
            code: "RMSTMCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['robinsons-starmills-pampanga', ],
            zero_prefix: false
        }, {
            name: "Glorietta 4 via Click The City",
            code: "G4CTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['glorietta-4', ],
            zero_prefix: false
        }, {
            name: "Greenbelt 1 via Click The City",
            code: "GB1CTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['greenbelt', ],
            zero_prefix: false
        }, {
            name: "Greenbelt 3 via Click The City",
            code: "GB3CTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['greenbelt-3', ],
            zero_prefix: false
        }, {
            name: "Alabang Town Center via Click The City",
            code: "ATCCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['alabang-town-center', ],
            zero_prefix: false
        }, {
            name: "Ayala Cebu Center via Click The City",
            code: "ACCCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['ayala-center-cebu', ],
            zero_prefix: false
        }, {
            name: "Market! Market! via Click The City",
            code: "M2CTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['market-market', ],
            zero_prefix: false
        }, {
            name: "Trinoma via Click The City",
            code: "TRICTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['trinoma-mall', ],
            zero_prefix: false
        }, {
            name: "Marquee via Click The City",
            code: "MRQCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['marquee-mall', ],
            zero_prefix: false
        }, {
            name: "Abreeza via Click The City",
            code: "ABRZCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['abreeza-mall', ],
            zero_prefix: false
        }, {
            name: "Harbor Point via Click The City",
            code: "HPCCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['harbor-point-mall', ],
            zero_prefix: false
        }, {
            name: "Centrio via Click The City",
            code: "CMCCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['centrio-mall', ],
            zero_prefix: false
        }, {
            name: "Fairview Terraces via Click The City",
            code: "FTCCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['fairview-terraces-cinema', ],
            zero_prefix: false
        }, {
            name: "Bonifacio High Street via Click The City",
            code: "BHSCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['bonifacio-high-street', ],
            zero_prefix: false
        }, {
            name: "Commercenter Cinemas via Click The City",
            code: "CCECCTC",
            callback: "scrapeClickTheCity",
            ctc_theaters: ['commercenter-cinemas', ],
            zero_prefix: false
        },
    ];

    //update or insert
    td.map(function(t) {
        Theater.update({
            code: t.code
        }, {
            $set: t
        }, {
            upsert: true
        }, function(err, numberAffected, raw) {
            if (err) return handleError(err);
            console.log('Upserted: ', t, raw);
        });
    });
    res.send({
        status: 'ok'
    });
}

var fetchall = function(req, res, next) {
    Theater.find().exec(function(err, dat) {
        if (err) return handleError(err);
        res.send(dat);
    });
}

exports.cron = cron;
exports.fetchall = fetchall;
exports.fetchdata = fetchdata;
exports.filldummy = filldummy;
exports.downloadcsv = downloadcsv;
