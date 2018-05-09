var mongoose = require('mongoose');

//var uristring = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || 'mongodb://192.168.33.10/reelscrape' || 'mongodb://pogipoints:n0b0dyn0b0dybutm3@oceanic.mongohq.com:10095/reelscrape';
//local and production mongo instance
var uristring = process.env.MONGOHQ_URL || 'mongodb://127.0.0.1/local';

// The http server will listen to an appropriate port, or default to port 5000.
var theport = process.env.PORT || 5000;

// Makes connection asynchronously.  Mongoose will queue up database
// operations and release them when the connection is complete.
mongoose.connect(uristring, function(err, res) {
    if (err) {
        console.log('ERROR connecting to: ' + uristring + '. ' + err);
    } else {
        console.log('Succeeded connected to: ' + uristring);
    }
});

var TheaterSchema = mongoose.Schema({
    name: String,
    code: String,
    callback: String,
    ctc_theaters: Array,
    zero_prefix: Boolean
});


var ScheduleSchema = mongoose.Schema({
    fetched: {
        type: Date,
        default: Date.now
    },
    code: String,
    schedule: {
        start: Date,
        cinema: String,
        movie_title: String,
        price: Number,
        variant: String,
    }

});

var MovieTitlesSchema = mongoose.Schema({
    canonical_title: String,
    correlation_title: Array
});

exports.Theater = mongoose.model('Theater', TheaterSchema);
exports.Schedule = mongoose.model('Schedule', ScheduleSchema);
