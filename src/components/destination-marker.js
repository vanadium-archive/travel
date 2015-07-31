// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

function markerIcon(color) {
  return 'http://maps.google.com/mapfiles/ms/icons/' + color + '-dot.png';
}

function deriveTitle(normalizedPlace) {
  return normalizedPlace.details && normalizedPlace.details.name ||
    //some maps API members are lower_underscore
    /* jshint camelcase: false */
    normalizedPlace.formatted_address;
    /* jshint camelcase: true */
}

var DestinationMarker = defineClass({
  statics: {
    color: {
      RED: 'red',
      ORANGE: 'orange',
      YELLOW: 'yellow',
      GREEN: 'green',
      LIGHT_BLUE: 'ltblue',
      BLUE: 'blue',
      PURPLE: 'purple',
      PINK: 'pink'
    }
  },

  privates: {
    refreshClickability: function() {
      this.marker.setClickable(this.onClick.has());
    },

    topClient: function() {
      return this.clients[this.clients.length - 1];
    },

    updateColor: function() {
      var color = this.topClient().color;
      this.marker.setIcon(markerIcon(color));
    }
  },

  publics: {
    clear: function() {
      this.marker.setMap(null);
    },

    pushClient: function(client, color) {
      color = color || this.topClient().color;
      this.clients.push({ client: client, color: color, listeners: [] });
      this.updateColor();
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
        this.updateColor();
      }
    },

    setColor: function(color) {
      this.topClient().color = color;
      this.updateColor();
    }
  },

  events: [ 'onClick' ],
  constants: [ 'marker', 'normalizedPlace' ],

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
  init: function(maps, map, normalizedPlace, client, color) {
    var self = this;

    this.map = map;
    this.normalizedPlace = normalizedPlace;
    this.clients = [{ client: client, color: color, listeners: [] }];

    this.marker = new maps.Marker({
      icon: markerIcon(color),
      map: map,
      place: normalizedPlace.place,
      title: deriveTitle(normalizedPlace),
      clickable: false
    });

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

      self.refreshClickability();
    });

    maps.event.addListener(this.marker, 'click', $.proxy(this, 'onClick'));
  }
});

module.exports = DestinationMarker;
