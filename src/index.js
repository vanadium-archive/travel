var $ = require('./util/jquery');
var Travel = require('./travel');
var debug = require('./debug');
var strings = require('./strings').currentLocale;

//http://api.jquery.com/ready/
$(function() {
  //http://stackoverflow.com/questions/180103/jquery-how-to-change-title-of-document-during-ready/11171548#11171548
  $('html head title').text(strings['Travel Planner']);
  debug(new Travel());
});