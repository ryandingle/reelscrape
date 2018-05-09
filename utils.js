var time = require('time'),
    format = require("date-format"),
    request = require("request");

time.Date.prototype.getFormattedTime = function() {
    var hours = this.getHours() == 0 ? "12" : this.getHours() > 12 ? this.getHours() - 12 : this.getHours();
    hours = (hours < 10 ? '0' : '') + hours;
    var minutes = (this.getMinutes() < 10 ? "0" : "") + this.getMinutes();
    var ampm = this.getHours() < 12 ? "AM" : "PM";
    var formattedTime = hours + ":" + minutes + " " + ampm;
    return formattedTime;
}

var parseSchedsRob = function(s) {
    var cinema_code = s[0].Cinema_Code;
    var price = (parseFloat(s[0].Price)).toFixed(2);
    var schedules = s.map(function(x) {
        t = starttime(x.Start_Time);
        return t;
    });
    return {
        code: cinema_code,
        price: price,
        schedules: schedules
    }
}

var fixTimeFormat = function(time_parameter) {
    var meridian = time_parameter.slice(-2).toLowerCase().trim();
    time_parameter = time_parameter.slice(0, -2).split(':');
    var hours = time_parameter[0].trim();
    var minutes = time_parameter[1].trim();
    if (hours.length < 2) {
        hours = '0' + hours;
    }
    return hours + ':' + minutes + ' ' + meridian.toUpperCase();
};

var fixDateFormat = function(date_parameter) {
    date_parameter = date_parameter.split('/');
    var month = date_parameter[0],
        day = date_parameter[1],
        year = date_parameter[2];

    if (month.length < 2) {
        month = '0' + month;
    }
    if (day.length < 2) {
        day = '0' + day;
    }

    return month + '/' + day + '/' + year;
};

var getAMPM = function(show_times) {
    var hours;
    var am_pm = 'am';
    for (index = 0; index < show_times.length; index++) {
        var is_meridian = show_times[index].slice(-2).toLowerCase().trim()
        if(is_meridian != 'am' && is_meridian != 'pm' && is_meridian != 'mn' && is_meridian != 'nn') {
            hours = show_times[index].split(':')[0];
            if (am_pm == 'am') {
                if (hours > 10 && hours < 12) {
                    show_times[index] = show_times[index] + am_pm;
                } else {
                    am_pm = 'pm';
                    show_times[index] = show_times[index] + am_pm;
                }
            } else {
                show_times[index] = show_times[index] + am_pm;
            }
        }
    }
    return show_times
};

var fixMegaWorldSchedules = function(show_times) {
    var screenings = [];
    var is_tomorrow = false;

    for (i=0; i<show_times.length; i++) {
        var show_date = new Date();
        var show_date_time_array = [];

        if (i > 0) {
            var hour = convertToMilitaryTime(show_times[i]).split(':')[0];
            var prev_hour = convertToMilitaryTime(show_times[i-1]).split(':')[0];
            var meridian = show_times[i].slice(-2).toLowerCase().trim();
            var prev_meridian = show_times[i-1].slice(-2).toLowerCase().trim();
            if (is_tomorrow) {
                show_date.setDate(show_date.getDate() + 1);
            } else {
                if (prev_meridian == 'pm') {
                    if ((meridian == 'am' || meridian == 'mn') || (parseInt(prev_hour) >= parseInt(hour))) {
                        show_date.setDate(show_date.getDate() + 1);
                        is_tomorrow = true;
                    }
                }
            }
        }

        show_date = format("MM/dd/yyyy", show_date);
        show_date_time_array.push(show_date);
        show_date_time_array.push(show_times[i]);
        screenings.push(show_date_time_array);
    }

    return screenings;
};

var convertToAMPM = function(time) {
    time = time.toString().match(/^([01]\d|2[0-3])(:)([0-5]\d)?$/) || [time];

    if (time.length > 1) {
        time = time.slice(1);
        time[5] = +time[0] < 12 ? ' AM' : ' PM';
        time[0] = +time[0] % 12 || 12;
    }

    return time.join('');
};

var replaceVariantFromTitle = function(movie_title) {
    console.log('Replacing Variant from Movie Title...');
    var variants = ['2D', '3D', '4Dx', 'Atmos', 'IMAX'];
    var pattern_single = '\\((\\s)*(' + variants.join('|') + ')(\\s)*\\)|(' + variants.join('|') + ')';
    var in_pattern_single = '\\((\\s)*in(\\s)*(' + variants.join('|') + ')(\\s)*\\)|in(\\s)*(' + variants.join('|') + ')';
    var pattern_multiple = '\\((\\s)*(' + variants.join('|') + ')(\\s)*(\/(\\s)*(' + variants.join('|') + ')*(\\s)*)+(\\s)*(' + variants.join('|') + ')(\\s)*\\)|(' + variants.join('|') + ')(\\s)*(\/(\\s)*(' + variants.join('|') + ')*(\\s)*)+(\\s)*(' + variants.join('|') + ')';
    var in_pattern_multiple = '\\((\\s)*in(\\s)*(' + variants.join('|') + ')(\\s)*(\/(\\s)*(' + variants.join('|') + ')*(\\s)*)+(\\s)*(' + variants.join('|') + ')(\\s)*\\)|in(\\s)*(' + variants.join('|') + ')(\\s)*(\/(\\s)*(' + variants.join('|') + ')*(\\s)*)+(\\s)*(' + variants.join('|') + ')';
    var pattern = new RegExp(pattern_multiple + '|' + in_pattern_multiple + '|' + pattern_single + '|' + in_pattern_single, 'gi');

    return movie_title.replace(pattern, '').trim();
};

var getVariantFromTitle = function(movie_title) {
    console.log('Getting Variant from Movie Title...');
    var movie_variant = '';
    var variants = ['2D', '3D', '4Dx', 'Atmos', 'IMAX'];
    var pattern_single = '\\((\\s)*(' + variants.join('|') + ')(\\s)*\\)|(' + variants.join('|') + ')';
    var in_pattern_single = '\\((\\s)*in(\\s)*(' + variants.join('|') + ')(\\s)*\\)|in(\\s)*(' + variants.join('|') + ')';
    var pattern_multiple = '\\((\\s)*(' + variants.join('|') + ')(\\s)*(\/(\\s)*(' + variants.join('|') + ')*(\\s)*)+(\\s)*(' + variants.join('|') + ')(\\s)*\\)|(' + variants.join('|') + ')(\\s)*(\/(\\s)*(' + variants.join('|') + ')*(\\s)*)+(\\s)*(' + variants.join('|') + ')';
    var in_pattern_multiple = '\\((\\s)*in(\\s)*(' + variants.join('|') + ')(\\s)*(\/(\\s)*(' + variants.join('|') + ')*(\\s)*)+(\\s)*(' + variants.join('|') + ')(\\s)*\\)|in(\\s)*(' + variants.join('|') + ')(\\s)*(\/(\\s)*(' + variants.join('|') + ')*(\\s)*)+(\\s)*(' + variants.join('|') + ')';
    var pattern = new RegExp(pattern_multiple + '|' + in_pattern_multiple + '|' + pattern_single + '|' + in_pattern_single, 'gi');

    if(movie_title.match(pattern)) {
        movie_variant = movie_title.match(pattern)[0].replace('(', '').replace(')', '').replace('in', '').trim();
    }

    return movie_variant;
};

var appendResults = function(movie_title, code, cinema, today, show_time, price, movie_variant) {
    return {
        title: movie_title,
        code: code,
        cinema: cinema,
        date: today,
        time: show_time,
        price: price,
        variant: movie_variant
    };
};

//some stupid time parser taken from Robinsons site
var starttime = function(t) {
    return new time.Date(parseInt(t.replace("/Date(", "").replace(")/", ""))).setTimezone('Asia/Manila').getFormattedTime();
    //var hh = (startTime.getHours() <10 ? '0' :'') + startTime.getHours();
    //var mm = (startTime.getMinutes() <10 ? '0' :'' ) + startTime.getMinutes()
    //var time = hh+":"+mm;
    //return time
};

var getCorrelationTitle = function(title) {
    var title_words = title.toLowerCase().split(' ');
    var filter_words = [ 'the', 'a', 'an', 'or', 'and', 'is', 'in' ];
    var correlation_title = '';

    for(ct_iter=0; ct_iter < title_words.length; ct_iter++) {
        if(filter_words.indexOf(title_words[ct_iter]) < 0) {
            correlation_title = correlation_title + title_words[ct_iter];
        }
    }

    var split_title = correlation_title.split(/\W+/g);
    for (var i = 0; i < split_title.length; i++) {
        split_title[i] = split_title[i].toLowerCase();
    }

    return split_title.join("");
};

var getGAEMovieTitles = function(callback) {
    var gae_url = "https://globe-gmovies.appspot.com/api/0/movies/?is_showing=true&is_expired=false";
    var headers = {
        'X-GMovies-DeviceId': '12345678910'
    };

    request({
        url: gae_url,
        headers: headers
    }, function(error, response, data) {
        console.log("Connecting to GAE...");
        if (!error && response.statusCode == 200) {
            var gae_movies = [];
            data = JSON.parse(data);
            for (var iter = 0; iter < data.results.length; iter++) {
                var movie_title = data.results[iter].movie.canonical_title;
                var movie_correlation_title = getCorrelationTitle(movie_title);
                gae_movies.push({
                    "movie_title": movie_title,
                    "movie_correlation_title": movie_correlation_title,
                });
            }
        } else {
            console.log("Connection error: %s", error);
        }
        callback(null, gae_movies);
    });
};

var getMovieNotInGAE = function(movie_title) {
    console.log("Getting Selected Not GAE Movie...");
    movie_list = [{
        "title": "Plus One",
        "other_title": "+1"
    }, {
        "title": "Brick Mansions",
        "other_title": "Brick Mansion"
    }, {
        "title": "The Amazing Spider-Man 2",
        "other_title": "The Amazing Spiderman 2"
    }];

    try {
        var movie_title = movie_list.filter(function(b) {
            return (b.other_title.toLowerCase() == movie_title.toLowerCase());
        })[0].title;
    } catch (error) {
        console.log("%s Movie still not found...", movie_title);
        console.log(error);
    }

    return movie_title;
};

var getSelectedGAEMovies = function(gae_movies, movie_title) {
    console.log("Getting Selected GAE Movie...");
    var correlation_title = getCorrelationTitle(movie_title);

    try {
        var movie_title = gae_movies.filter(function(b) {
            return (b.movie_correlation_title == correlation_title);
        })[0].movie_title;
    } catch (error) {
        console.log("%s Movie not found on GAE...", movie_title);
        console.log(error);
        movie_title = getMovieNotInGAE(movie_title);
    }

    return movie_title;
};

var transform = function(x) {
    if (x) {
        console.log("transforming...");
        d = new Array()
        x.forEach(function(i) {
            y = new Array();
            y.push(i.title);
            y.push(i.code);
            y.push(i.cinema);
            y.push(i.date);
            y.push(i.time);
            y.push(i.price);
            y.push(i.variant);
            d.push(y);
        });
        return d;
    }
    return;
};

var convertToMilitaryTime = function( time_parameter ) {
    var meridian = time_parameter.slice( -2 ).toLowerCase();
    time_parameter = time_parameter.slice( 0, -2 ).split( ':' );
    var hours = time_parameter[0];
    var minutes = time_parameter[1];
    if( hours.length < 2 ) {
        hours = '0' + hours;
    }
    if( meridian == 'pm' && hours != 12 ) {
        hours = ( hours == '12' ) ? '00' : parseInt( hours ) + 12;
    }
    else if( ( meridian == 'am' || meridian == 'mn' ) && hours == 12 ) {
        hours = '00';
    }
    return hours + ':' + minutes;
};

exports.transform = transform;
exports.parseSchedsRob = parseSchedsRob;
exports.fixTimeFormat = fixTimeFormat;
exports.fixDateFormat = fixDateFormat;
exports.getAMPM = getAMPM;
exports.convertToAMPM = convertToAMPM;
exports.appendResults = appendResults;
exports.getGAEMovieTitles = getGAEMovieTitles;
exports.getSelectedGAEMovies = getSelectedGAEMovies;
exports.getVariantFromTitle = getVariantFromTitle;
exports.replaceVariantFromTitle = replaceVariantFromTitle;
exports.fixMegaWorldSchedules = fixMegaWorldSchedules;
