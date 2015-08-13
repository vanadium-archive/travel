// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');
var strings = require('../strings').currentLocale;

function markerIcon(opts) {
  if (opts.icon) {
    return 'http://chart.apis.google.com/chart?chst=d_map_pin_icon&chld=' +
      opts.icon + '|' + opts.color;
  } else {
    return 'http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=' +
      (opts.label || '•') + '|' + opts.color;
  }
}

var DestinationMarker = defineClass({
  statics: {
    color: {
      RED: 'FC6355',
      ORANGE: 'FF8000', //TODO(rosswang): tune
      YELLOW: 'FFFF00', //TODO(rosswang): tune
      GREEN: '00E73D',
      LIGHT_BLUE: '8080FF', //TODO(rosswang): tune
      BLUE: '7090FC', // originally '5781FC',
      PURPLE: '8000FF', //TODO(rosswang): tune
      PINK: 'FF8080' //TODO(rosswang): tune
    },

    icon: {
      ORIGIN: 'home',
      DESTINATION: 'flag'
    }
  },

  publics: {
    clear: function() {
      this.marker.setMap(null);
    },

    pushClient: function(client, color) {
      this.clients.push($.extend({}, this.topClient(), {
        client: client,
        color: color,
        listeners: []
      }));
      this.updateIcon();
      this.updateTitle();
    },

    removeClient: function(client) {
      var onClick = this.onClick;
      this.clients = this.clients.filter(function(entry) {
        var match = entry.client === client;
        if (match) {
          $.each(entry.listeners, function() {
            onClick.remove(this);
          });
        }
        return !match;
      });

      this.refreshClickability();

      if (!this.clients.length) {
        this.clear();
      } else {
        this.updateIcon();
        this.updateTitle();
      }
    },

    getClient: function() {
      return this.topClient().client;
    },

    setColor: function(color) {
      this.topClient().color = color;
      this.updateIcon();
    },

    setDestinationLabel: function(destinationLabel) {
      this.topClient().destinationLabel = destinationLabel;
      this.updateTitle();
    },

    setLabel: function(label) {
      var client = this.topClient();
      client.label = label;
      client.icon = null;
      this.updateIcon();
    },

    restrictListenerToClient: function(callback, client) {
      var self = this;
      client = client || this.getClient();
      return function() {
        if (self.getClient() === client) {
          return callback.apply(this, arguments);
        }
      };
    },

    setIcon: function(icon) {
      var client = this.topClient();
      client.icon = icon;
      client.label = null;
      this.updateIcon();
    }
  },

  privates: {
    refreshClickability: function() {
      this.marker.setClickable(this.onClick.has());
    },

    topClient: function() {
      return this.clients[this.clients.length - 1];
    },

    getIcon: function() {
      return markerIcon(this.topClient());
    },

    updateIcon: function() {
      this.marker.setIcon(this.getIcon());
    },

    updateTitle: function() {
      var destLabel = this.topClient().destinationLabel;
      this.marker.setTitle(destLabel?
        strings.label(this.topClient().destinationLabel, this.title) :
        this.title);
    }
  },

  events: [ 'onClick' ],
  constants: [ 'marker', 'place' ],

  /**
   * A note on clients: destination markers can be shared between multiple use
   * cases, ex. search and multiple actual destination associations. A marker
   * is removed when all of its clients have been removed. The latest client
   * determines the color of the marker. Click event handlers are added per
   * client, unless they're added as global (a second argument to
   * `Callbacks.add`); all remain active while their client is registered, but
   * when the client is removed the corresponding click handlers are removed as
   * well.
   */
  init: function(maps, map, place, client, color) {
    var self = this;

    this.map = map;
    this.place = place;
    this.clients = [{ client: client, color: color, listeners: [] }];

    this.icon = null;
    this.label = '';

    this.title = place.getName();

    this.marker = new maps.Marker({
      icon: this.getIcon(),
      map: map,
      place: place.getPlaceObject(),
      title: this.title,
      clickable: false
    });

    /* Override onClick.add to keep a record of which listeners are bound to
     * which clients to remove listeners on client removal. This does not
     * however implicitly restrict such listeners; that must be left to the
     * caller so as to allow the caller to later pre-emptively remove the
     * listener if desired. */
    defineClass.decorate(this.onClick, 'add', function(listener, global) {
      if (!global) {
        /* Per jQuery, listener can also be an array; however, there seems to
         * be a bug in jQuery at this time where remove will not remove arrays,
         * only individual functions, so let's flatten here. */
        var listeners = self.topClient().listeners;
        if ($.isArray(listener)) {
          $.each(listener, function() {
            listeners.push(this);
          });
        } else {
          listeners.push(listener);
        }
      }
    }, function() {
      self.refreshClickability();
    });

    maps.event.addListener(this.marker, 'click', this.onClick);
  }
});

module.exports = DestinationMarker;
