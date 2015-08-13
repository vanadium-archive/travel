// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var defineClass = require('./util/define-class');

var Destination = defineClass({
  publics: {
    getIndex: function() {
      return this.index;
    },

    getPlace: function() {
      return this.place;
    },

    hasPlace: function() {
      return !!this.place;
    },

    setPlace: function(place) {
      var prev = this.place;
      if (prev !== place) {
        this.place = place;
        this.onPlaceChange(place, prev);
      }
    },

    isSelected: function() {
      return this.selected;
    },

    select: function() {
      if (!this.selected) {
        this.selected = true;
        this.onSelect();
      }
    },

    deselect: function() {
      if (this.selected) {
        this.selected = false;
        this.onDeselect();
      }
    },

    hasNext: function() {
      return this.index < this.list.count() - 1;
    },

    getNext: function() {
      return this.list.get(this.index + 1);
    },

    hasPrevious: function() {
      return this.index > 0;
    },

    getPrevious: function() {
      return this.hasPrevious()? this.list.get(this.index - 1) : null;
    }
  },

  privates: {
    setIndex: function(index) {
      this.index = index;
    }
  },

  events: [
    /**
     * Fired when properties related to the ordering of this destination with
     * respect to other timeline have changed. Such properties include
     * whether this destination is or last and its index number.
     *
     * @param index the new index, which may not have changed. If the index has
     *  not changed, then this event is in response to the destination changing
     *  to or from last.
     */
    'onOrdinalChange',
    /**
     * Fired when the destination has been set to a place, or cleared.
     * @param place the new destination, as a normalized place.
     * @param previous the old destination, as a normalized place.
     */
    'onPlaceChange',
    'onSelect',
    'onDeselect'
  ],

  init: function(list, index, callbacks) {
    this.list = list;
    this.selected = false;
    this.index = index;

    callbacks.ordinalChange = this.onOrdinalChange;
    this.onOrdinalChange.add(this.setIndex);
  }
});

module.exports = Destination;