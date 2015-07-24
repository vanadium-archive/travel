var $ = require('./util/jquery');
var Travel = require('./travel');
var debug = require('./debug');

//http://api.jquery.com/ready/
$(function() {
  debug(new Travel());
});