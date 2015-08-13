// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('./util/jquery');

var Destinations = require('./components/destinations');
var Messages = require('./components/messages');
var Message = require('./components/message');
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
    addDestination: function() {
      var map = this.map;

      var destination = map.addDestination();
      var control = this.destinations.append();
      control.bindDestination(destination);

      control.setSearchBounds(map.getBounds());
      map.onBoundsChange.add(control.setSearchBounds);

      control.onFocus.add(function() {
        if (!destination.isSelected()) {
          map.closeActiveInfoWindow();
          destination.select();
        }
      });

      control.onSearch.add(function(results) {
        map.showSearchResults(results);

        /* There seems to be a bug where if you click a search suggestion (for
         * a query, not a resolved location) in autocomplete, the input box
         * under it gets clicked and focused... I haven't been able to figure
         * out why. */
         control.focus();
      });

      return control;
    },

    error: function (err) {
      this.messages.push(Message.error(
        err.message || err.msg || err.toString()));
    },

    info: function (info, promise) {
      var messageData = Message.info(info);
      messageData.promise = promise;
      this.messages.push(messageData);
    }
  },

  init: function (opts) {
    var self = this;

    opts = opts || {};
    var vanadiumWrapper = opts.vanadiumWrapper || vanadiumWrapperDefault;

    var map = this.map = new Map(opts);
    var maps = map.maps;

    var messages = this.messages = new Messages();
    var destinations = this.destinations = new Destinations(maps);

    var sync = this.sync = new TravelSync();

    var error = this.error;

    map.addControls(maps.ControlPosition.TOP_CENTER, messages.$);
    map.addControls(maps.ControlPosition.LEFT_TOP, destinations.$);

    destinations.onAddClick.add(function() {
      self.addDestination().focus();
    });

    this.info(strings['Connecting...'], vanadiumWrapper.init(opts.vanadium)
      .then(function(wrapper) {
        wrapper.onCrash.add(error);

        var identity = new Identity(wrapper.getAccountName());
        identity.mountName = makeMountName(identity);
        return sync.start(identity.mountName, wrapper);
      }).then(function() {
        return strings['Connected to all services.'];
      }, function(err) {
        console.error(err);
        throw err;
      }));

    var directionsServiceStatusStrings = buildStatusErrorStringMap(
      maps.DirectionsStatus, strings.DirectionsStatus);

    map.onError.add(function(err) {
      var message = directionsServiceStatusStrings[err.directionsStatus] ||
        strings['Unknown error'];

      error(message);
    });

    var $domRoot = opts.domRoot? $(opts.domRoot) : $('body');
    $domRoot.append(map.$);

    this.addDestination();
    this.addDestination();
  }
});

function makeMountName(id) {
  // TODO: first-class app-wide rather than siloed by account
  return 'users/' + id.username + '/travel/' + id.deviceName;
}

module.exports = Travel;
