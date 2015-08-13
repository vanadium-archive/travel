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
      return !!this.next;
    },

    getNext: function() {
      return this.next;
    },

    bindNext: function(next) {
      var oldNext = this.next;
      if (oldNext !== next) {
        if (oldNext) {
          oldNext.bindPrev(null);
        }

        this.next = next;

        if (next) {
          next.bindPrevious(this.ifc);
        }

        if (!(oldNext && next)) {
          this.onOrdinalChange(); //changed to or from last
        }
      }
    },

    hasPrevious: function() {
      return !!this.prev;
    },

    getPrevious: function() {
      return this.prev;
    },

    bindPrevious: function(prev) {
      if (this.prev !== prev) {
        if (this.prev) {
          this.prev.onOrdinalChange.remove(this.updateIndex);
          this.prev.bindNext(null);
        }

        this.prev = prev;

        if (prev) {
          prev.bindNext(this.ifc);
          prev.onOrdinalChange.add(this.updateIndex);
        }

        this.updateIndex();
      }
    }
  },

  privates: {
    updateIndex: function() {
      var oldIndex = this.index;
      if (this.prev) {
        this.index = this.prev.getIndex() + 1;
      } else {
        this.index = 0;
      }
      if (oldIndex !== this.index) {
        this.onOrdinalChange();
      }
    }
  },

  events: [
    /**
     * Fired when properties related to the ordering of this destination with
     * respect to other destinations have changed. Such properties include
     * whether this destination is or last and its index number.
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

  init: function() {
    this.selected = false;
    this.index = 0;
  }
});

module.exports = Destination;