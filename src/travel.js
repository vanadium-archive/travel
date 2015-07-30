var $ = require('./util/jquery');

var message = require('./components/message');
var vanadiumWrapperDefault = require('./vanadium-wrapper');

var defineClass = require('./util/define-class');

var Map = require('./components/map');
var TravelSync = require('./travelsync');
var Identity = require('./identity');

var strings = require('./strings').currentLocale;

function buildStatusErrorStringMap(statusClass, stringGroup) {
  var dict = {};
  $.each(statusClass, function(name, value) {
    dict[value] = stringGroup[name];
  });
  return dict;
}

var Travel = defineClass({
  publics: {
    error: function (err) {
      this.map.message(message.error(err.toString()));
    },

    info: function (info) {
      this.map.message(message.info(info));
    }
  },

  init: function (opts) {
    opts = opts || {};
    var vanadiumWrapper = opts.vanadiumWrapper || vanadiumWrapperDefault;
    var travel = this;

    this.sync = new TravelSync();

    var reportError = $.proxy(this, 'error');

    vanadiumWrapper.init(opts.vanadium).then(
      function(wrapper) {
        wrapper.onCrash.add(reportError);

        var identity = new Identity(wrapper.getAccountName());
        identity.mountName = makeMountName(identity);
        travel.sync.start(identity.mountName, wrapper).catch(reportError);
      }, reportError);

    this.map = new Map(opts);

    var directionsServiceStatusStrings = buildStatusErrorStringMap(
      this.map.maps.DirectionsStatus, strings.DirectionsStatus);

    this.map.onError.add(function(err) {
      var message = directionsServiceStatusStrings[err.directionsStatus] ||
        strings['Unknown error'];

      reportError(message);
    });

    var $domRoot = opts.domRoot? $(opts.domRoot) : $('body');
    $domRoot.append(travel.map.$);
  }
});

function makeMountName(id) {
  // TODO: first-class app-wide rather than siloed by account
  return 'users/' + id.username + '/travel/' + id.deviceName;
}

module.exports = Travel;
