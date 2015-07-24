var jq = require('jquery');
var window = require('global/window');

if (window.document) {
  module.exports = jq;
} else {
  var jsdom = require('jsdom').jsdom;
  window = jsdom().parentWindow;
  module.exports = jq(window);
}