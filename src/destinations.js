// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('./util/jquery');
var defineClass = require('./util/define-class');
var Destination = require('./destination');

var Destinations = defineClass({
  publics: {
    add: function(index) {
      index = index !== undefined? index : this.destinations.length;

      var isLast = index === this.destinations.length;

      var callbacks = {};
      var destination = new Destination(this.ifc, index, callbacks);

      this.destinations.splice(index, 0, {
        callbacks: callbacks,
        destination: destination
      });

      if (isLast && index > 0) {
        //old last is no longer last
        this.destinations[index - 1].callbacks.ordinalChange(index - 1);
      }
      for (var i = index + 1; i < this.destinations.length; i++) {
        this.destinations[i].callbacks.ordinalChange(i);
      }

      this.onAdd(destination);

      return destination;
    },

    get: function(index) {
      if (index === undefined) {
        return this.destinations.map(function(record) {
          return record.destination;
        });
      }

      var record;
      if (index >= 0) {
        record = this.destinations[index];
      } else if (index < 0) {
        record = this.destinations[this.destinations.length + index];
      }

      return record && record.destination;
    },

    count: function() {
      return this.destinations.length;
    },

    remove: function(i) {
      if (typeof i !== 'number') {
        return;
      }

      if (i < 0) {
        i += this.destinations.length;
      }

      var removed = this.destinations.splice(i, 1)[0];
      if (removed) {
        if (i === this.destinations.length && i > 0) {
          //new last
          this.destinations[i - 1].callbacks.ordinalChange(i - 1);
        }
        for (var j = i; j < this.destinations.length; j++) {
          this.destinations[j].callbacks.ordinalChange(j);
        }

        this.onRemove(removed.destination);

        return removed.destination;
      }
    },

    /**
     * Behaves like jQuery each.
     */
    each: function(callback) {
      $.each(this.destinations, function(i, elem) {
        callback.call(this.destination, i, elem.destination);
      });
    }
  },

  events: [
    /**
     * @param destination. The index on the destination is reflective of its
     *  insertion index.
     */
    'onAdd',

    /**
     * @param destination. The index on the destination is reflective of its
     *  index prior to removal.
     */
    'onRemove'
  ],

  init: function() {
    this.destinations = [];
  }
});

module.exports = Destinations;