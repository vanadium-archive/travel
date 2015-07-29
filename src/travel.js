var $ = require('./util/jquery');

var message = require('./components/message');
var vanadiumWrapperDefault = require('./vanadium-wrapper');

var defineClass = require('./util/define-class');

var Maps = require('./components/maps');
var TravelSync = require('./travelsync');
var Identity = require('./identity');

var Travel = defineClass({
  publics: {
    error: function (err) {
      this.maps.message(message.error(err.toString()));
    },

    info: function (info) {
      this.maps.message(message.info(info));
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

    this.maps = new Maps(opts);
    var $domRoot = opts.domRoot? $(opts.domRoot) : $('body');
    $domRoot.append(travel.maps.$);
  }
});

function makeMountName(id) {
  // TODO: first-class app-wide rather than siloed by account
  return 'users/' + id.username + '/travel/' + id.deviceName;
}

module.exports = Travel;
