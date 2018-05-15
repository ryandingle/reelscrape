var format = require("date-format"),
    request = require("request"),
    cheerio = require('cheerio'),
    async = require("async"),
    Schedule = require("./dbconfig").Schedule,
    scrapeutils = require("./utils"),
    parseString = require('xml2js').parseString;

function Scraper() {
    //constructor
}

Scraper.prototype.scrapeShang = function(theater_code, exfunc) {
    console.log("Scraping Shangri-La Plaza Mall " + theater_code);
    var results = new Array();
    var remote_url = 'http://www.shangcineplex.com/index.asp';
    var today = format("MM/dd/yyyy", new Date());

    function getSchedulesToday(gae_movies, callback) {
        console.log("Connecting as of %s to remote_url: %s", today, remote_url);
        request(remote_url, function(error, response, html) {
            if (!error && response.statusCode == 200) {
                console.log('loading data...');
                var $ = cheerio.load(html);
                var regex_price = /\[[a-z]*[0-9]*.*[0-9]*\]/gi,
                    regex_parse_price = /[0-9].*[0-9]/gi;
                $('table.movietable').parent().parent().each(function(iter, el) {
                    console.log('parsing data...');
                    var movie_title = $(this).find('table.movietable').children().find('td.movietitle').text().trim();
                    var movie_time = $(this).find('table.movietable').children().find('td.movievalues').last().text().trim();
                    var img = $(this).find('table.movietable').children().children().children().last().attr('src');
                    if (movie_title != '' && movie_title != null) {
                        var movie_price = movie_title.match(regex_price);
                        if (movie_price != '' && movie_price != null && movie_price != undefined) {
                            movie_price = movie_price[0];
                            movie_title = scrapeutils.replaceVariantFromTitle(movie_title.replace(movie_price, '').trim());
                            movie_price = movie_price.match(regex_parse_price)[0];
                        } else {
                            movie_price = '0.00'
                            movie_title = scrapeutils.replaceVariantFromTitle(movie_title);
                        }
                        var movie_variant = scrapeutils.getVariantFromTitle(movie_title);
                        var selected_gae_movie = scrapeutils.getSelectedGAEMovies(gae_movies, movie_title);
                    }
                    if (movie_time != '' && movie_time != null) {
                        var movie_time = movie_time.split(' / ');
                        $(movie_time).each(function(index, value) {
                            movie_time[index] = scrapeutils.fixTimeFormat(value);
                        });
                    }
                    if (img != '' && img != null) {
                        var cinema = img.replace('images/cinema', '').replace( '5', 'Premiere' ).split('.')[0];
                    }
                    $(movie_time).each(function(index, show_time) {
                        var data = scrapeutils.appendResults(selected_gae_movie, theater_code, cinema, today, show_time, movie_price, movie_variant);
                        results.push(data);
                    });
                });
            } else {
                var msg = "Connection error: " + error;
                console.log("Connection error: %s", error);
                exfunct([{
                    "error": msg
                }]);
            };
            console.log('Sending results...');
            callback(results)
        });
    };

    async.waterfall([scrapeutils.getGAEMovieTitles, getSchedulesToday], function(results) {
        var flattend = []
        if (results.length > 0) {
            results.forEach(function(result) {
                flattend.push({
                    title: result.title,
                    code: result.code,
                    cinema: result.cinema,
                    date: result.date,
                    time: result.time,
                    price: result.price,
                    variant: result.variant
                });
            });
        }
        exfunc(flattend);
    });
};


Scraper.prototype.scrapeMegaworld = function(theater_code, exfunc) {
    console.log("Scraping Megaworld Cinemas@: " + theater_code);
    var results = [];
    var today = new Date();
    var remote_url = "http://megaworldlifestylemalls.com/movies/select";
    var code = '';
    var id = '';
    var movie_schedules = [];

    switch(theater_code) {
        case "EWCW":
            code = 'EWC';
            id = '6';
            break;
        case "EWLCT":
            code = 'LCT';
            id = '1';
            break;
        default://new port mall
            code = 'NPC';
            id = '4';
    }

    function getMovieSchedulesUrl(gae_movies, callback) {
        console.log("Connecting as of %s to remote_url: %s", today, remote_url);
        request.post(remote_url, {'id': id, 'code': code }, function(error, response, html) {
            if (!error && response.statusCode == 200) {
                console.log('loading data: movie_title and schedules_url...');
                var data = JSON.parse(html);
                var $ = cheerio.load(data.content);

                $('div.movie-list-1 ul li').each(function(iter, el) {
                    if((iter % 2) == true) return true;
                    var movie_title = $(this).children('div.info-movie').find('p.movie-title').text().trim();
                    var schedules_url = $(this).children('div.info-movie').find('a').attr('href');
                    movie_title = scrapeutils.getSelectedGAEMovies(gae_movies, movie_title);
                    movie_schedules.push({'movie_title': movie_title, 'schedules_url': schedules_url});
                });
            } else {
                var msg = "Connection error: " + error;
                console.log(msg);
                exfunct([{
                    "error": msg
                }]);
            };
            callback(null, movie_schedules);
        });
    }

    function getSchedulesToday(movie_schedules, callback) {
        function get_movie_schedules(movie_schedules, next) {
            var movie_title = movie_schedules.movie_title;
            var movie_schedule_url = movie_schedules.schedules_url;
            var regex_price = /PHP\s*[0-9]*.*[0-9]*/gi;
            var regex_screening_time = /\d{1,2}:\d{2}\s*[AP]M|\d{1,2}:\d{2}\s*[MN]N/gi;
            console.log("Connecting as of %s to remote_url: %s", today, movie_schedule_url);
            request(movie_schedule_url, function(error, response, html) {
                //if (!error && response.statusCode == 200) {
                    var $ = cheerio.load(html);
                    //var theater_code_options = {'EWCW': 'h4.eastwood', 'EWM': 'h4.eastwood', 'NMRW': 'h4.newport', 'EWLCT': 'h4.luckychinatownmall'};
                    var found;
                    var movie_variant = '';
                    var default_price = '0.00';
                    var el_code = '';
                    switch(theater_code) {
                        case "EWCW":
                            el_code = '2';
                            break;
                        case "EWLCT":
                            el_code = '3';
                            break;
                        default://new port mall
                            el_code = '4';
                    }

                    
                    var price = '0.00';
                    var cinema = '';
                    
                    $('div.cinema-sched-section').find('div.'+el_code+' table tr').each(function(iter, el) {
                        console.log('loading data: schedule details...');

                        var screening_html_content = '';
                        var screening_time = [];

                        if((iter % 5) == 0 || iter == 2) {
                            $(this).find('td').each(function(key, val){
                                if(key == 1){
                                    screening_html_content = $(this).find('p').text().trim();
                                }
                            });
                            
                        }
                        if((iter % 4) == 0 || iter == 1) {
                            $(this).find('td').each(function(key, val){
                                if(key == 1){
                                    price = $(this).find('p').text().trim().replace('Php','');
                                    price = $(this).find('p').text().trim().replace('PHP','');
                                }
                            });
                        }

                        if((iter % 3) == 0 || iter == 0)
                        {   
                            $(this).find('td').each(function(key, val){
                                if(key == 0){
                                    cinema = $(this).text().trim();
                                }
                            });
                        }

                        while (found = regex_screening_time.exec(screening_html_content)) {
                            screening_time.push(found[0])
                        }

                        screening_time = scrapeutils.fixMegaWorldSchedules(screening_time);
                        $(screening_time).each(function(index, screening) {
                            show_time = scrapeutils.fixTimeFormat(screening[1]);
                            show_date = screening[0];
                            var data = scrapeutils.appendResults(movie_title, theater_code, cinema, show_date, show_time, price, movie_variant);
                            results.push(data);
                        });
                    });
                /*} else {
                    var msg = "Connection error: " + error;
                    console.log(msg);
                    exfunct([{
                        "error": msg
                    }]);
                };*/
                next(null, results);
            });
        }

        async.map(movie_schedules, get_movie_schedules, function(err, results) {
            if (err) {
                console.log("Async Map Error: %s", err);
                return;
            }
            console.log("Got consolidated movie schedules...");
            callback(results);
        });
    }

    async.waterfall([scrapeutils.getGAEMovieTitles, getMovieSchedulesUrl, getSchedulesToday], function(results) {
        console.log(results);
        var flattend = []
        if (results[0].length > 0) {
            results[0].forEach(function(result) {
                if (theater_code == 'EWCW') {
                    if (parseInt(result.cinema) == 1 || parseInt(result.cinema) == 2 || parseInt(result.cinema) == 3 || parseInt(result.cinema) == 4) {
                        flattend.push({
                            title: result.title,
                            code: result.code,
                            cinema: result.cinema,
                            date: result.date,
                            time: result.time,
                            price: result.price,
                            variant: result.variant
                        });
                    }
                } else if (theater_code == 'EWM') {
                    if (parseInt(result.cinema) == 5 || parseInt(result.cinema) == 6 || parseInt(result.cinema) == 7) {
                        if (parseInt(result.cinema) == 7) {
                            var result_cinema = 'Ultra 7'
                        } else {
                            var result_cinema = result.cinema
                        }

                        flattend.push({
                            title: result.title,
                            code: result.code,
                            cinema: result_cinema,
                            date: result.date,
                            time: result.time,
                            price: result.price,
                            variant: result.variant
                        });
                    }
                } else {
                    if (theater_code == 'NMRW' && parseInt(result.cinema) == 1) {
                        var result_cinema = 'Ultra 1'
                    } else {
                        var result_cinema = result.cinema
                    }

                    flattend.push({
                        title: result.title,
                        code: result.code,
                        cinema: result_cinema,
                        date: result.date,
                        time: result.time,
                        price: result.price,
                        variant: result.variant
                    });
                }
            });
        }
        exfunc(flattend);
    });
}


Scraper.prototype.scrapeRockwellPP = function(theater_code, exfunc) {
    console.log("Scraping Rockwell Power Plant " + theater_code);
    var results = new Array();
    var remote_url = 'https://powerplantcinema.com/api/cinetix/getSchedules';
    var today = format("MM/dd/yyyy", new Date());

    function getSchedulesToday(gae_movies, callback) {
        console.log("Connecting as of %s to remote_url: %s", today, remote_url);
        request.post(remote_url, function(error, response, data) {
            console.log('loading data...');
            if (!error && response.statusCode == 200) {
                data = JSON.parse(data);

                for (i = 0; i < data.content.length; i++) {

                    var movie_title = data.content[i].movie_details.title;
                    var cinema = data.content[i].cinema.replace('POWER PLANT CINEMA ', '');
                    var screening_date = data.content[i].date;
                    var screening_time = data.content[i].screening_time[0].start;
                    var price = '0.00';
                    var screening_time = scrapeutils.fixTimeFormat(screening_time);

                    var movie_title = scrapeutils.replaceVariantFromTitle(movie_title);
                    var movie_variant = scrapeutils.getVariantFromTitle(movie_title);
                    var selected_gae_movie = scrapeutils.getSelectedGAEMovies(gae_movies, movie_title);
                    var datas = scrapeutils.appendResults(selected_gae_movie, theater_code, cinema, screening_date, screening_time, price, movie_variant);
                    results.push(datas);
                }
            } else {
                console.log("Connection error: %s", error);
            }
            console.log('Sending results...');
            callback(results);
        });
    }

    async.waterfall([scrapeutils.getGAEMovieTitles, getSchedulesToday], function(results) {
        var flattend = []
        if (results.length > 0) {
            results.forEach(function(result) {
                flattend.push({
                    title: result.title,
                    code: result.code,
                    cinema: result.cinema,
                    date: result.date,
                    time: result.time,
                    price: result.price,
                    variant: result.variant
                });
            });
        }
        exfunc(flattend);
    });
};

Scraper.prototype.scrapeGreenhills = function(theater_code, exfunc) {
    console.log("Scraping Greenhills Cinemas@: " + theater_code);
    var results = new Array();
    var remote_url = 'http://www.greenhills.com.ph/cinema.php';
    var today = format("MM/dd/yyyy", new Date());

    function getSchedulesToday(gae_movies, callback) {
        console.log("Connecting as of %s to remote_url: %s", today, remote_url);
        request(remote_url, function(error, response, html) {
            if (!error && response.statusCode == 200) {
                console.log('loading data...');
                var $ = cheerio.load(html);
                var price_details = new Array();
                var regex_price = /(P|₱) (\d\d\d.\d\d|\d\d.\d\d|\d\d\d|\d\d)/,
                    regex_show_time = /\d\d:\d\d|\d:\d\d/gi;
                $('div.pink').parent().each(function(iter, el) {
                    var found;
                    var show_time_matches = [];
                    var movie_type,
                        theater_type,
                        price;
                    var cinema = $(this).find('div.pink').text().trim().replace('Cinema ', '');
                    var movie_variant = '';
                    $($(this).find('div.blue img')).each(function(index, value) {
                        if (movie_type != undefined || movie_type != null) {
                            movie_type = $(this).attr('src').replace('cinema/', '').split('.')[0] + movie_type;
                        } else {
                            movie_type = $(this).attr('src').replace('cinema/', '').split('.')[0];
                        }
                    });
                    if(parseInt(cinema) == 1 || parseInt(cinema) == 2) {
                        theater_type = 'GHT';
                    } else if(parseInt(cinema) == 3 || parseInt(cinema) == 4 || parseInt(cinema) == 5) {
                        theater_type = 'GHP';
                    } else if(parseInt(cinema) == 6 || parseInt(cinema) == 7 || parseInt(cinema) == 8) {
                        theater_type = 'GHA';
                    }
                    if (theater_type == theater_code) {
                        console.log('parsing data...');
                        var price = $(this).text().match(regex_price)[0].slice(1).trim();
                        var title = scrapeutils.replaceVariantFromTitle($(this).children('div.blue').text().replace(/([a-z]|:)([A-Z])/g, '$1 $2').trim());
                        var selected_gae_movie = scrapeutils.getSelectedGAEMovies(gae_movies, title);
                        while (found = regex_show_time.exec($(this).text().trim())) {
                            show_time_matches.push(found[0]);
                        }
                        show_time_matches = scrapeutils.getAMPM(show_time_matches);
                        $(show_time_matches).each(function(index, show_time) {
                            var show_time = scrapeutils.fixTimeFormat(show_time);
                            if (price == undefined || price == null) {
                                price = '0.00';
                            }
                            var data = scrapeutils.appendResults(selected_gae_movie, theater_code, cinema, today, show_time, price, movie_variant);
                            results.push(data);
                        });
                    }
                });
            } else {
                var msg = "Connection error: " + error;
                console.log(msg);
                exfunct([{
                    "error": msg
                }]);

            };
            console.log('Sending results...');
            callback(results);
        });
    };

    async.waterfall([scrapeutils.getGAEMovieTitles, getSchedulesToday], function(results) {
        var flattend = []
        if (results.length > 0) {
            results.forEach(function(result) {
                flattend.push({
                    title: result.title,
                    code: result.code,
                    cinema: result.cinema,
                    date: result.date,
                    time: result.time,
                    price: result.price,
                    variant: result.variant
                });
            });
        }
        exfunc(flattend);
    });
};

Scraper.prototype.scrapeGateway = function(theater_code, exfunc) {
    console.log("Scraping Gateway Mall Cinemas@: " + theater_code);
    var results = new Array();
    var remote_url = 'https://www.gatewaycineplex10.com/';
    var today = format("MM/dd/yyyy", new Date());

    function getSchedulesToday(gae_movies, callback) {
        console.log("Connecting as of %s to remote_url: %s", today, remote_url);
        request(remote_url, function(error, response, html) {
            if (!error && response.statusCode == 200) {
                console.log('loading data...');
                var $ = cheerio.load(html);
                var regex_show_time = /(\d|\d\d):\d\d(am|nn|pm|mn)/g;
                var default_price = '0.00';
                var movie_variant = '';
                var default_cinema = 'Cineplex 10';
                $('div#recipeCarousel div.carousel-inner div.carousel-item div.card').each(function(iter, el) {
                    console.log('parsing data card...');
                    var found;
                    var show_time_matches = new Array();
                    var title = $(this).find('div.card-block h4.card-title').text().trim();
                    var selected_gae_movie = scrapeutils.getSelectedGAEMovies(gae_movies, title);
                    while (found = regex_show_time.exec($(this).find('div.card-block p.card-text b a').text().trim())) {
                        show_time_matches.push(scrapeutils.fixTimeFormat(found[0]));
                    }
                    $(show_time_matches).each(function(index, show_time) {
                        var data = scrapeutils.appendResults(selected_gae_movie, theater_code, default_cinema, today, show_time, default_price, movie_variant);
                        results.push(data);
                    });
                });
            } else {
                var msg = "Connection error: " + error;
                console.log(msg);
                exfunct([{
                    "error": msg
                }]);
            };
            console.log('Sending results...');
            callback(results);
        });
    };

    async.waterfall([scrapeutils.getGAEMovieTitles, getSchedulesToday], function(results) {
        var flattend = []
        if (results.length > 0) {
            results.forEach(function(result) {
                flattend.push({
                    title: result.title,
                    code: result.code,
                    cinema: result.cinema,
                    date: result.date,
                    time: result.time,
                    price: result.price,
                    variant: result.variant
                });
            });
        }
        exfunc(flattend);
    });
};

Scraper.prototype.scrapeFestival = function(theater_code, exfunc) {
    console.log("Scraping Festival Super Mall Cinemas@: " + theater_code);
    var results = new Array();
    var remote_url = 'http://festivalsupermall.com/cinema/';
    var today = format("MM/dd/yyyy", new Date());

    function getSchedulesToday(gae_movies, callback) {
        console.log("Connecting as of %s to remote_url: %s", today, remote_url);

        var options = {
          url: remote_url,
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate',
            'Accept-Language': 'en-US,en;q=0.9,fil;q=0.8',
            'Cache-Control':' max-age=0',
            'Connection': 'keep-alive',
            'Host': 'festivalsupermall.com',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.139 Safari/537.36',
          }
        };

        request(options, function(error, response, html) {
            if (!error && response.statusCode == 200) {
                console.log('loading data...');
                var $ = cheerio.load(html);
                var default_price = '0.00';
                var split_separators = ['Movie Title: ', 'Starring Role: ', 'MTRCB Rating: ', 'Screening Time: ', 'Running Time: ', 'Synopsis: '];
                $('div.normaltxtwhite').each(function(iter, el) {
                    console.log('parsing data...');
                    var content_text = $(this).text().trim();
                    var contents = content_text.split(new RegExp(split_separators.join('|'), 'g'));
                    var cinema = contents[0].trim().replace('Cinema:', '').trim();
                    var title = contents[1].trim();
                    var movie_title_array = contents[1].split(')    ');
                    if(movie_title_array.length <= 1) {
                        movie_title_array = contents[1].split(')   ');
                        if(movie_title_array.length <= 1) {
                            movie_title_array = contents[1].split('/');
                        } else {
                            movie_title_array[0] = movie_title_array[0] + ')';
                        }
                    } else {
                        movie_title_array[0] = movie_title_array[0] + ')';
                    }
                    if (cinema != '' && cinema != null && cinema != undefined) {
                        if (title != 'Venue Rental' && title != 'Notice' && title != 'n/a' && title != '' && title != null && title != undefined) {
                            if (parseInt(movie_title_array.length) > 1) {
                                var show_times = [];
                                var movie_show_times = contents[4].trim().split('/');
                                $(movie_show_times).each(function(index, show_time) {
                                    show_time = show_time.trim().split('-').pop();
                                    show_times.push(scrapeutils.getAMPM(show_time.trim().split('   ')));
                                });
                                $(movie_title_array).each(function(index, movie_title) {
                                    var movie_variant = scrapeutils.getVariantFromTitle(movie_title.trim());
                                    movie_title = scrapeutils.replaceVariantFromTitle(movie_title.trim());
                                    var selected_gae_movie = scrapeutils.getSelectedGAEMovies(gae_movies, movie_title);
                                    $(show_times[index]).each(function(index, show_time) {
                                        var show_time = scrapeutils.fixTimeFormat(show_time);
                                        var data = scrapeutils.appendResults(selected_gae_movie, theater_code, cinema, today, show_time, default_price, movie_variant);
                                        results.push(data);
                                    });
                                });
                            } else {
                                var movie_variant = scrapeutils.getVariantFromTitle(title);
                                var show_times = scrapeutils.getAMPM(contents[4].trim().split('   '));
                                title = scrapeutils.replaceVariantFromTitle(title.trim());
                                var selected_gae_movie = scrapeutils.getSelectedGAEMovies(gae_movies, title);
                                $(show_times).each(function(index, show_time) {
                                    show_time = scrapeutils.fixTimeFormat(show_time);
                                    var data = scrapeutils.appendResults(selected_gae_movie, theater_code, cinema, today, show_time, default_price, movie_variant);
                                    results.push(data);
                                });
                            }
                        }
                    }
                });
            } else {
                var msg = "Connection error: " + error;
                console.log(msg);
                exfunct([{
                    "error": msg
                }]);

            };
            console.log('Sending results...');
            callback(results);
        });
    };

    async.waterfall([scrapeutils.getGAEMovieTitles, getSchedulesToday], function(results) {
        var flattend = []
        if (results.length > 0) {
            results.forEach(function(result) {
                flattend.push({
                    title: result.title,
                    code: result.code,
                    cinema: result.cinema,
                    date: result.date,
                    time: result.time,
                    price: result.price,
                    variant: result.variant
                });
            });
        }
        exfunc(flattend);
    });
};

Scraper.prototype.scrapeRobinsons = function(code, exfunc) {
    var schedules_data = null;
    console.log("Scraping Robinsons Cinemas@: " + code);
    var branches = [{
        code_name: "",
        code_val: "9",
        loc: "ANGELES"
    }, {
        code_name: "",
        code_val: "17",
        loc: "BACOLOD"
    }, {
        code_name: "",
        code_val: "20",
        loc: "BUTUAN"
    }, {
        code_name: "",
        code_val: "12",
        loc: "DASMARIÑAS"
    }, {
        code_name: "",
        code_val: "15",
        loc: "DUMAGUETE"
    }, {
        code_name: "",
        code_val: "4",
        loc: "FORUM"
    }, {
        code_name: "RMGAL",
        code_val: "1",
        loc: "GALLERIA"
    }, {
        code_name: "",
        code_val: "18",
        loc: "GENSAN"
    }, {
        code_name: "",
        code_val: "6",
        loc: "ILOCOS"
    }, {
        code_name: "",
        code_val: "14",
        loc: "ILOILO"
    }, {
        code_name: "",
        code_val: "11",
        loc: "IMUS"
    }, {
        code_name: "",
        code_val: "13",
        loc: "LIPA"
    }, {
        code_name: "RMMAG",
        code_val: "5",
        loc: "MAGNOLIA"
    }, {
        code_name: "",
        code_val: "21",
        loc: "MALOLOS"
    }, {
        code_name: "RMMNL",
        code_val: "2",
        loc: "MANILA"
    }, {
        code_name: "",
        code_val: "3",
        loc: "METRO EAST"
    }, {
        code_name: "",
        code_val: "19",
        loc: "PALAWAN"
    }, {
        code_name: "",
        code_val: "7",
        loc: "PANGASINAN"
    }, {
        code_name: "",
        code_val: "22",
        loc: "ROXAS"
    }, {
        code_name: "",
        code_val: "23",
        loc: "SANTIAGO"
    }, {
        code_name: "",
        code_val: "10",
        loc: "STA. ROSA"
    }, {
        code_name: "RMSTM",
        code_val: "8",
        loc: "STARMILLS"
    }, {
        code_name: "",
        code_val: "16",
        loc: "TACLOBAN"
    }];

    var selected_branch = branches.filter(function(b) {
        return (b.code_name == code);
    })[0].code_val;
    console.log("Selected Branch: %s", selected_branch);

    var today = format("yyyy-MM-dd", new Date()),
        today_t = format("MM/dd/yyyy", new Date());

    var now_showing_url = "http://www.robinsonsmovieworld.com/getNowShowingMovies.aspx";
    var schedules_url = "http://www.robinsonsmovieworld.com/getScheduleByBranchAndMovie.aspx";
    //see form data being sent to remote url
    var form_data = {
        "branchID": selected_branch,
        "date": today,
        "search": "branch",
        searchVal: ""
    };

    console.log("Connecting as of %s to remote_url: %s", today, now_showing_url);

    var now_showing_url = "http://www.robinsonsmovieworld.com/getNowShowingMovies.aspx";
    var schedules_url = "http://www.robinsonsmovieworld.com/getScheduleByBranchAndMovie.aspx";
    //see form data being sent to remote url
    var form_data = {
        "branchID": selected_branch,
        "date": today,
        "search": "branch",
        "searchVal": ""
    };

    console.log("Connecting as of %s to remote_url: %s", today, now_showing_url);

    function getMovies(gae_movies, callback) {
        var movies = [];
        console.log("%j", form_data);
        request.post({
            url: now_showing_url,
            form: form_data
        }, function(error, response, data) {
            if (!error && response.statusCode == 200) {
                data = JSON.parse(data);

                for (var iter = 0; iter < data.length; iter++) {
                    var movie_variant = scrapeutils.getVariantFromTitle(data[iter]["Movie_Name"]);
                    movie_title_code = {
                        "title": scrapeutils.replaceVariantFromTitle(data[iter]["Movie_Name"]),
                        "movie_code": data[iter]["Movie_Code"],
                        "movie_variant": movie_variant
                    };
                    movies.push(movie_title_code);
                }
            } else {
                var msg = "Connection error: " + error;
                console.log(msg);
                exfunct([{
                    "error": msg
                }]);
            }

            console.log("getting schedules...");
            var schedules_payload = movies.map(function(movie) {
                return {
                    title: movie.title,
                    variant: movie.movie_variant,
                    url: schedules_url,
                    payload: {
                        "branchID": form_data.branchID,
                        "date": form_data.date,
                        "searchVal": "branch",
                        "movieCode": movie.movie_code
                    },
                    gae_movies: gae_movies
                };
            });

            callback(null, schedules_payload);
        });
    }

    function get_consolidated_schedules(schedules_payload, callback) {
        function get_movie_schedules(schedule, next) {
            request.post({
                url: schedule.url,
                form: schedule.payload
            }, function(err, response, data) {
                if (!err && response.statusCode == 200) {
                    data = JSON.parse(data);

                    var parsedScheds = [];

                    data.forEach(function(d) {
                        scheds = scrapeutils.parseSchedsRob(d.PriceLists[0].XSchedulesList);
                        parsedScheds.push(scheds);
                    });
                    var movie_scheds = [];
                    var movie_title = schedule.title.trim();
                    var movie_variant = schedule.variant;
                    var selected_gae_movie = scrapeutils.getSelectedGAEMovies(schedule.gae_movies, movie_title);
                    parsedScheds.forEach(function(ps) {
                        var ms = ps.schedules.map(function(sc, idx) {
                            return {
                                title: selected_gae_movie,
                                variant: movie_variant,
                                code: code,
                                cinema: ps.code,
                                date: today_t,
                                time: ps.schedules[idx],
                                price: ps.price
                            };
                        });

                        movie_scheds = movie_scheds.concat(ms);

                    });
                    next(null, movie_scheds);

                } else {
                    console.log("Error fetching schedules: " + err)
                }
            });

        }

        async.map(schedules_payload, get_movie_schedules, function(err, results) {
            if (err) {
                console.log("Async Map Error: %s", err);
                return;
            }
            //console.log("Got consolidated schedules...", results);
            callback(results);
        });
    }

    async.waterfall([scrapeutils.getGAEMovieTitles, getMovies, get_consolidated_schedules], function(results) {
        var flattend = []
        results.forEach(function(result) {
            result.forEach(function(r) {
                flattend.push({
                    title: r.title,
                    code: r.code,
                    cinema: r.cinema,
                    date: r.date,
                    time: r.time,
                    price: r.price,
                    variant: r.variant
                });
            });
        });
        exfunc(flattend);
    });
};

Scraper.prototype.scrapeSM = function(code, exfunc) {
    console.log("Scraping SM Cinemas@: " + code);
    var schedules_data = null;
    var branches = [{
        code_name: "SMAU",
        code_val: "SMAU"
    }, {
        code_name: "SMCDO",
        code_val: "SMCO"
    }, {
        code_name: "SMCEB",
        code_val: "SMCC"
    }, {
        code_name: "SMCLA",
        code_val: "SMCK"
    }, {
        code_name: "SMCON",
        code_val: "SMCS"
    }, {
        code_name: "SMDAV",
        code_val: "SMCD"
    }, {
        code_name: "SMDLA",
        code_val: "SMLA"
    }, {
        code_name: "SMMM",
        code_val: "SMMG"
    }, {
        code_name: "SMMOA",
        code_val: "SMOA"
    }, {
        code_name: "SMOLO",
        code_val: "SMOL"
    }, {
        code_name: "SMNE",
        code_val: "SMNE"
    }, {
        code_name: "SMPAM",
        code_val: "SMPP"
    }, {
        code_name: "SMSFP",
        code_val: "SMSF"
    }, {
        code_name: "SMSTH",
        code_val: "SMSM"
    }, {
        code_name: "SMBD",
        code_val: "SMBD"
    }, {
        code_name: "SMCB",
        code_val: "SMCB"
    }, {
        code_name: "SMBG",
        code_val: "SMBG"
    }, {
        code_name: "SMBL",
        code_val: "SMBL"
    }, {
        code_name: "SMBA",
        code_val: "SMBA"
    }, {
        code_name: "SMBF",
        code_val: "SMBF"
    }, {
        code_name: "SMBT",
        code_val: "SMBT"
    }, {
        code_name: "SMCL",
        code_val: "SMCL"
    }, {
        code_name: "SMCA",
        code_val: "SMCA"
    }, {
        code_name: "SMDM",
        code_val: "SMDM"
    }, {
        code_name: "SMCF",
        code_val: "SMCF"
    }, {
        code_name: "SMGS",
        code_val: "SMGS"
    }, {
        code_name: "SMCI",
        code_val: "SMCI"
    }, {
        code_name: "SMLP",
        code_val: "SMLP"
    }, {
        code_name: "SMLC",
        code_val: "SMLC"
    }, {
        code_name: "SMCM",
        code_val: "SMCM"
    }, {
        code_name: "SMMK",
        code_val: "SMMK"
    }, {
        code_name: "SMMR",
        code_val: "SMMR"
    }, {
        code_name: "SMMS",
        code_val: "SMMS"
    }, {
        code_name: "SMML",
        code_val: "SMML"
    }, {
        code_name: "SMMT",
        code_val: "SMMT"
    }, {
        code_name: "SMNG",
        code_val: "SMNG"
    }, {
        code_name: "SMNV",
        code_val: "SMNV"
    }, {
        code_name: "SMKL",
        code_val: "SMKL"
    }, {
        code_name: "SMRS",
        code_val: "SMRS"
    }, {
        code_name: "SMRO",
        code_val: "SMRO"
    }, {
        code_name: "SMSL",
        code_val: "SMSL"
    }, {
        code_name: "SMPB",
        code_val: "SMPB"
    }, {
        code_name: "SMST",
        code_val: "SMST"
    }, {
        code_name: "SMSR",
        code_val: "SMSR"
    }, {
        code_name: "SMSC",
        code_val: "SMSC"
    }, {
        code_name: "SMTT",
        code_val: "SMTT"
    }, {
        code_name: "SMTL",
        code_val: "SMTL"
    }, {
        code_name: "SMVL",
        code_val: "SMVL"
    }]
    var selected_branch = branches.filter(function(b) {
        return (b.code_name == code);
    })[0].code_val;
    var today = format("yyyy-MM-dd", new Date()),
        today_t = format("MM/dd/yyyy", new Date());
    var remote_url = "https://www.smcinema.com/ajaxMovies.php";
    var form_data = {
        "branch_code": selected_branch,
        "method": "listMovies"
    };

    console.log("Connecting as of %s to remote_url: %s", today, remote_url);
    console.log("selected_branch: %s", selected_branch);

    function getMovies(gae_movies, callback) {
        var movies = [];
        request.post({
            url: remote_url,
            form: form_data
        }, function(error, response, data) {
            if (!error && response.statusCode == 200) {
                data = JSON.parse(data);

                for (var iter = 0; iter < data.length; iter++) {
                    movie_title_code = {
                        "title": scrapeutils.replaceVariantFromTitle(data[iter]["movie_name"].trim()),
                        "movie_code": data[iter]["movie_code"]
                    };
                    movies.push(movie_title_code);
                }
            } else {
                console.log("Connection error: %s SM feed is unreachable", error);
            }
            console.log("getting schedules...");
            var schedules_payload = movies.map(function(movie) {
                return {
                    title: movie.title,
                    url: remote_url,
                    payload: {
                        "method": "listScreeningTime",
                        "branch_code": selected_branch,
                        "movie_name": movie.title
                    },
                    gae_movies: gae_movies
                };
            });
            callback(null, schedules_payload);
        });
    }

    function get_consolidated_schedules(schedules_payload, callback) {
        function get_movie_schedules(schedule, next) {
            request.post({
                url: schedule.url,
                form: schedule.payload
            }, function(err, response, data) {
                if (!err && response.statusCode == 200) {
                    var schedules_today = new Array();
                    schedules_data = JSON.parse(data);
                    for (key in JSON.parse(data)) {
                        var schedules = schedules_data[key];
                        for (i = 0; i < schedules.length; i++) {
                            var show_date = schedules[i].StartTime.slice(0, 10);
                            if (show_date == today) {
                                schedules_today.push(schedules[i]);
                            }
                        }
                    }
                    var s = schedules_today.map(function(sc, idx) {
                        var show_time = sc.StartSched.slice(-8);
                        var movie_title = sc.MovieName.trim();
                        var selected_gae_movie = scrapeutils.getSelectedGAEMovies(schedule.gae_movies, movie_title);
                        return {
                            title: selected_gae_movie,
                            variant: sc.FilmFormat.replace('F', '').trim(),
                            code: code,
                            cinema: sc.CinemaName.replace('DCinema', '').replace( 'Cinema', '' ).replace( 'Digital Theatre', '' ).replace( 'Digital', '' ).replace(/\s{2,}/g, ' ').trim(),
                            date: today_t,
                            time: show_time,
                            price: sc.Price
                        }
                    });
                    next(null, s);
                } else {
                    console.log("Error fetching schedules: " + err)
                }
            });
        }

        async.map(schedules_payload, get_movie_schedules, function(err, results) {
            if (err) {
                console.log("Async Map Error: %s", err);
                return;
            }
            console.log("Got consolidated schedules...");
            callback(results);
        });
    }

    async.waterfall([scrapeutils.getGAEMovieTitles, getMovies, get_consolidated_schedules], function(results) {
        var flattend = []
        results.forEach(function(result) {
            result.forEach(function(r) {
                flattend.push({
                    title: r.title,
                    code: r.code,
                    cinema: r.cinema,
                    date: r.date,
                    time: r.time,
                    price: r.price,
                    variant: r.variant
                });
            });
        });
        exfunc(flattend);
    });
};

// Scraper for Mobext Sureseats API.
/* Scraper.prototype.scrapeAyalaMalls = function( code, exfunc ){
    console.log( "Scraping Ayala Mall Cinemas@: " + code );
    var today = format( "yyyy-MM-dd", new Date() ),
        today_t = format( "MM/dd/yyyy", new Date() );
    var schedule_url = "http://sureseatsmapi.mobext.ph/api/MovieSchedule/" + today,
        now_showing_url = "http://sureseatsmapi.mobext.ph/api/Movie/NowShowing",
        theaters_url = "http://sureseatsmapi.mobext.ph/api/Theaters",
        cinemas_url = "http://sureseatsmapi.mobext.ph/api/Cinemas/";
    var headers = {
        'Authorization': 'Bearer AUFHxF5HQBEpzQaEyPEsLI0um1E='
    };

    var branches = [{
        code_name: "G4",
        code_val: "GL4"
    }, {
        code_name: "GB1",
        code_val: "GB1"
    }, {
        code_name: "GB3",
        code_val: "GB3"
    }, {
        code_name: "ATC",
        code_val: "ATC"
    }, {
        code_name: "ACC",
        code_val: "ACC"
    }, {
        code_name: "M2",
        code_val: "MRK"
    }, {
        code_name: "TRI",
        code_val: "TRI"
    }, {
        code_name: "MRQ",
        code_val: "MQR"
    }, {
        code_name: "ABRZ",
        code_val: "ABRZ"
    }, {
        code_name: "HPC",
        code_val: "HPC"
    }, {
        code_name: "CMC",
        code_val: "CMC"
    }, {
        code_name: "FTC",
        code_val: "FTC"
    }, {
        code_name: "BHS",
        code_val: "BHS"
    }]

    var selected_theater_code = branches.filter(function(b) {
        return (b.code_name == code);
    })[0];

    function getTheaterList(gae_movies, callback) {
        console.log("Fetching Theaters...");
        request({
            url: theaters_url,
            headers: headers
        }, function(error, response, data) {
            if (!error && response.statusCode == 200) {
                theaters = [];
                data = JSON.parse(data);
                var selected_theater = data.filter(function(b) {
                    return (b.Code == selected_theater_code.code_val);
                })[0];
                var theater_details = {
                    "theater_id": selected_theater.TheaterID,
                    "theater_name": selected_theater.Name,
                    "theater_code": selected_theater_code.code_name,
                };
                theaters.push({
                    "theater_details": theater_details,
                    "gae_movies": gae_movies
                });
            } else {
                console.log("Connection error: %s", error);
            }
            callback(null, theaters);
        });
    }

    function getCinemaList(theaters, callback) {
        console.log("Fetching Cinemas...");

        function get_theater_cinemas(theater, next) {
            var theater_cinemas_url = cinemas_url + theater.theater_details.theater_id;
            request({
                url: theater_cinemas_url,
                headers: headers
            }, function(error, response, data) {
                if (!error && response.statusCode == 200) {
                    var cinemas = [];
                    cinemas_gae_movies = []
                    data = JSON.parse(data);
                    for (var iter = 0; iter < data.length; iter++) {
                        var cinema_details = {
                            "theater_id": theater.theater_details.theater_id,
                            "theater_name": theater.theater_details.theater_name,
                            "theater_code": theater.theater_details.theater_code,
                            "cinema_id": data[iter]["CinemaID"],
                            "cinema_name": data[iter]["Name"],
                        };
                        cinemas.push(cinema_details);
                    }
                } else {
                    console.log("Connection error: %s", error);
                }
                cinemas_gae_movies.push({
                    "cinema_details": cinemas,
                    "gae_movies": theater.gae_movies
                });
                next(null, cinemas_gae_movies);
            });
        }

        async.map(theaters, get_theater_cinemas, function(err, results) {
            if (err) {
                console.log("Async Map Error: %s", err);
                return;
            }
            console.log("Got consolidated cinemas...");
            callback(null, results);
        });
    };

    function getMovieList(cinemas, callback) {
        console.log("Fetching Movies...");
        request({
            url: now_showing_url,
            headers: headers
        }, function(error, response, data) {
            if (!error && response.statusCode == 200) {
                var movies = [];
                data = JSON.parse(data);
                for (var iter = 0; iter < data.length; iter++) {
                    var selected_gae_movie = scrapeutils.getSelectedGAEMovies(cinemas[0][0].gae_movies, data[iter]["Title"]);
                    movie_details = {
                        "movie_id": data[iter]["MovieID"],
                        "movie_title": selected_gae_movie
                    };
                    movies.push({
                        "movie_details": movie_details,
                        "cinema_details": cinemas[0][0].cinema_details
                    });
                }
            } else {
                console.log("Connection error: %s", error);
            }
            callback(null, movies);
        });
    };

    function getSchedulesToday(movies, callback) {
        console.log("Fetching Schedules Today...");

        function get_movie_schedules(movie, next) {
            var movie_details = movie.movie_details,
                cinema_details = movie.cinema_details;
            schedule_url_bydate_permovie = schedule_url + '/perMovie/' + movie_details.movie_id;
            request({
                url: schedule_url_bydate_permovie,
                headers: headers
            }, function(error, response, data) {
                if (!error && response.statusCode == 200) {
                    var schedules_today = [];
                    data = JSON.parse(data);
                    for (var iter = 0; iter < data.length; iter++) {
                        var selected_cinema = cinema_details.filter(function(b) {
                            return (b.cinema_id == data[iter]["CinemaID"]);
                        })[0];
                        var start_time = scrapeutils.fixTimeFormat(scrapeutils.convertToAMPM(data[iter]["TimeStart"].slice(-8, -3)));
                        schedule_details = {
                            title: movie_details.movie_title,
                            theater_code: selected_cinema.theater_code,
                            cinema: selected_cinema.cinema_name,
                            date: today_t,
                            start_time: start_time,
                            price: "0.00"
                        }
                        schedules_today.push(schedule_details);
                    }
                    var schedules = schedules_today.map(function(sc, idx) {
                        return {
                            title: sc.title,
                            code: sc.theater_code,
                            cinema: sc.cinema,
                            date: sc.date,
                            time: sc.start_time,
                            price: sc.price
                        }
                    });
                    next(null, schedules);
                } else {
                    console.log("Connection error: %s", error);
                }
            });
        };

        async.map(movies, get_movie_schedules, function(err, results) {
            if (err) {
                console.log("Async Map Error: %s", err);
                return;
            }
            console.log("Got consolidated schedules...");
            callback(results);
        });
    }

    async.waterfall([scrapeutils.getGAEMovieTitles, getTheaterList, getCinemaList, getMovieList, getSchedulesToday], function(results) {
        var flattend = []
        results.forEach(function(result) {
            if (result.length > 0) {
                result.forEach(function(r) {
                    flattend.push({
                        title: r.title,
                        code: r.code,
                        cinema: r.cinema,
                        date: r.date,
                        time: r.time,
                        price: r.price
                    });
                });
            }
        });
        exfunc(flattend);
    });
}; */

// Sureseats API
Scraper.prototype.scrapeAyalaMalls = function(code, exfunc) {
    console.log("Scraping Ayala Mall Cinemas@: " + code);
    var results = [];
    var today = format("yyyy-MM-dd", new Date()),
        today_t = format("MM/dd/yyyy", new Date());
    var remote_url = "http://api.sureseats.com/index.asp?action=SCHEDULE";

    function getSchedulesToday(gae_movies, callback) {
        console.log("Connecting as of %s to remote_url: %s", today, remote_url);
        request(remote_url, function(error, response, data) {
            console.log('loading data...');
            if (!error && response.statusCode == 200) {
                parseString(data, function(err, result) {
                    xml_data = result.Movie.Schedule;
                    for (i = 0; i < xml_data.length; i++) {
                        var movie_title = xml_data[i]['movie_title'][0].trim();
                        var theater = xml_data[i]['theater'][0].trim(),
                            theater_code = xml_data[i]['theater_code'][0].trim(),
                            cinema = xml_data[i]['cinema'][0].trim(),
                            screening_date = scrapeutils.fixDateFormat(xml_data[i]['screening'][0].split(' ')[0].trim()),
                            screening_time = xml_data[i]['screening'][0].split(' ')[1].trim() + ' ' + xml_data[i]['screening'][0].split(' ')[2].trim(),
                            price = xml_data[i]['price'][0].replace('Php', '').trim();

                        screening_time = scrapeutils.fixTimeFormat(screening_time);

                        if (screening_date == today_t && theater_code == code) {
                            movie_title = scrapeutils.replaceVariantFromTitle(movie_title);
                            var movie_variant = scrapeutils.getVariantFromTitle(xml_data[i]['movie_title'][0]);
                            var selected_gae_movie = scrapeutils.getSelectedGAEMovies(gae_movies, movie_title);
                            var data = scrapeutils.appendResults(selected_gae_movie, theater_code, cinema, screening_date, screening_time, price, movie_variant);
                            results.push(data);
                        }
                    }
                });
            } else {
                console.log("Connection error: %s", error);
            }
            console.log('Sending results...');
            callback(results);
        });
    };

    async.waterfall([scrapeutils.getGAEMovieTitles, getSchedulesToday], function(results) {
        var flattend = []
        if (results.length > 0) {
            results.forEach(function(result) {
                flattend.push({
                    title: result.title,
                    code: result.code,
                    cinema: result.cinema,
                    date: result.date,
                    time: result.time,
                    price: result.price,
                    variant: result.variant
                });
            });
        }
        exfunc(flattend);
    });
};

Scraper.prototype.scrapeClickTheCity = function(ctc_theaters, theater_code, exfunc) {
    console.log("Scraping %s Cinemas@: %s", ctc_theaters, theater_code);
    var results = [];
    var remote_url = 'https://www.clickthecity.com/movies/theaters/';
    var today = format("MM/dd/yyyy", new Date());
    theater_code = theater_code.slice(0, -3);

    function getSchedulesToday(gae_movies, callback) {
        function get_movie_schedules(ctc_theater, next) {
            var ctc_remote_url = remote_url + ctc_theater;
            console.log("Connecting as of %s to ctc_remote_url: %s", today, ctc_remote_url);
            request(ctc_remote_url, function(error, response, html) {
                if (!error && response.statusCode == 200) {
                    var $ = cheerio.load(html);
                    var default_price = '0.00';
                    $('ul#cinemas').find('li').each(function(iter, el) {
                        $(this).find('ul li').each(function(iter2, el2) {
                            console.log('parsing data...');
                            var movie_titles_array = [];
                            var movie_show_times_array = [];
                            var movie_variant = '';
                            var cinema = $(this).find('h2 em').text().trim();

                            if(theater_code == 'TRI') {
                                cinema = cinema.replace('TriNoma', '');
                            } else if(theater_code == 'CMC') {
                                cinema = cinema.replace('Centrio', '')
                            } else if(theater_code == 'HPC') {
                                cinema = cinema.replace('Harbor Point', '')
                            } else if(theater_code == 'RWPP') {
                                cinema = cinema.replace('Power Plant', '');
                            } else if(theater_code == 'GWY') {
                                cinema = cinema.replace('Gateway Cineplex', '').replace('(Platinum Cinema)', '');
                            } else if(theater_code == 'SHANG') {
                                cinema = cinema.replace('Shangri-la Plaza', '');
                            } else if(theater_code == 'EWLCT') {
                                cinema = cinema.replace('Lucky Chinatown', '');
                            } else if(theater_code == 'RMMNL') {
                                cinema = cinema.replace('Robinsons Manila', '').replace('(Midtown)', '').replace('(Pedro Gil)', '');
                            } else if(theater_code == 'FSA') {
                                cinema = cinema.replace('Festival', '');
                            } else if(theater_code == 'NMRW') {
                                cinema = cinema.replace('Newport', '');
                            } else if(theater_code == 'SMMOA') {
                                cinema = cinema.replace('SM Mall Of Asia', '').replace('Premiere', 'Premier');
                            } else if(theater_code == 'GHA' || theater_code == 'GHP' || theater_code == 'GHT') {
                                cinema = cinema.replace('Greenhills Theater Mall', '');
                            } else if(theater_code == 'M2') {
                                cinema = cinema.replace('Market Market', '');
                            } else if(theater_code == 'RMSTM') {
                                cinema = cinema.replace('Robinsons Starmills', '');
                            } else if(theater_code == 'SMCLA') {
                                cinema = cinema.replace('D-Cinema', '3');
                            } else if(theater_code == 'BHS') {
                                cinema = cinema.replace('(ATMOS)', '');
                            } else if(theater_code == 'SMDM') {
                                cinema = cinema.replace('SM City Dasma', '');
                            } else if(theater_code == 'SMCI') {
                                cinema = cinema.replace('D-Cinema', '5');
                            } else if(theater_code == 'SMSR') {
                                cinema = cinema.replace('SM Sta. Rosa', '');
                            } else if(theater_code == 'SMTT') {
                                cinema = cinema.replace('SM Taytay', '');
                            } else if(theater_code == 'SMMT') {
                                cinema = cinema.replace('SM Muntinlupa', '');
                            }

                            if(theater_code == 'SMSTH' || theater_code == 'SMKL') {
                                cinema = cinema.replace('Digital Theater', '1');
                            } else if(theater_code == 'SMBD') {
                                cinema = cinema.replace('Digital Theater', '2');
                            } else if(theater_code == 'SMCB') {
                                cinema = cinema.replace('Digital Theater', '5');
                            } else if(theater_code == 'SMCL') {
                                cinema = cinema.replace('Digital Theater', '4');
                            } else if(theater_code == 'SMLP' || theater_code == 'SMSR') {
                                cinema = cinema.replace('Digital Theater', '3');
                            } else {
                                cinema = cinema.replace('Digital Theater', '');
                            }

                            cinema = cinema.replace('Cinema', '').replace('Theatre', '').trim();

                            $($(this).find('div > a > span')).each(function(index, value) {
                                if(index > 0) {
                                    movie_titles_array.push($(this).text().trim());
                                    console.log('title'+$(this).text().trim());
                                }
                            });

                            $($(this).find('div.showtimes > span')).each(function(index, value) {
                                var show_times_split = $(this).text().trim().split('|');
                                var show_times = [];

                                for(i=0; i<show_times_split.length; i++) {
                                    show_times.push(scrapeutils.fixTimeFormat(show_times_split[i].trim()));
                                }
                                movie_show_times_array.push(show_times);
                            });

                            var movie_title = '';

                            $(this).find('div > a > span').each(function(i, val){
                                if(i == 0) {
                                    movie_title = $(this).text().trim();
                                }
                            });

                            $(movie_show_times_array).each(function(index, movie) {
                                var selected_gae_movie = scrapeutils.getSelectedGAEMovies(gae_movies, movie_title);
                                for(i=0; i<movie_show_times_array[index].length; i++) {
                                    var show_time = movie_show_times_array[index][i];
                                    var data = scrapeutils.appendResults(selected_gae_movie, theater_code, cinema, today, show_time, default_price, movie_variant);
                                    results.push(data);
                                }
                            });
                        });
                    });

                } else {
                    var msg = "Connection error: " + error;
                    console.log(msg);
                    exfunct([{
                        "error": msg
                    }]);
                };
                console.log('Sending results...');
                next(null, results);
            });
        };

        async.map(ctc_theaters, get_movie_schedules, function(err, results) {
            if (err) {
                console.log("Async Map Error: %s", err);
                return;
            }
            console.log("Got consolidated schedules...");
            callback(results);
        });
    };

    async.waterfall([scrapeutils.getGAEMovieTitles, getSchedulesToday], function(results) {
        var flattend = []
        if (results[0].length > 0) {
            results[0].forEach(function(result) {
                if(theater_code == 'ACC') {
                    if(parseInt(result.cinema) != 5) {
                        flattend.push({
                            title: result.title,
                            code: result.code,
                            cinema: result.cinema + 'D',
                            date: result.date,
                            time: result.time,
                            price: result.price,
                            variant: result.variant
                        });
                        flattend.push({
                            title: result.title,
                            code: result.code,
                            cinema: result.cinema + 'P',
                            date: result.date,
                            time: result.time,
                            price: result.price,
                            variant: result.variant
                        });
                    } else {
                        flattend.push({
                            title: result.title,
                            code: result.code,
                            cinema: result.cinema,
                            date: result.date,
                            time: result.time,
                            price: result.price,
                            variant: result.variant
                        });
                    }
                } else if(theater_code == 'TRI') {
                    if(parseInt(result.cinema) == 3 || parseInt(result.cinema) == 4 || parseInt(result.cinema) == 7) {
                        flattend.push({
                            title: result.title,
                            code: result.code,
                            cinema: result.cinema,
                            date: result.date,
                            time: result.time,
                            price: result.price,
                            variant: result.variant
                        });
                        flattend.push({
                            title: result.title,
                            code: result.code,
                            cinema: result.cinema + 'Z',
                            date: result.date,
                            time: result.time,
                            price: result.price,
                            variant: result.variant
                        });
                    } else {
                        flattend.push({
                            title: result.title,
                            code: result.code,
                            cinema: result.cinema,
                            date: result.date,
                            time: result.time,
                            price: result.price,
                            variant: result.variant
                        });
                    }
                } else {
                    flattend.push({
                        title: result.title,
                        code: result.code,
                        cinema: result.cinema,
                        date: result.date,
                        time: result.time,
                        price: result.price,
                        variant: result.variant
                    });
                }
            });
        }
        exfunc(flattend);
    });
};

exports.Scraper = Scraper;