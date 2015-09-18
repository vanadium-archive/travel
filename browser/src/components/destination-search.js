// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var debug = require('../debug');
var Place = require('../place');

var DestinationSearch = defineClass({
  publics: {
    clear: function() {
      var async = this.setPlace(null);
      this.$searchBox.prop('value', '');
      return async;
    },

    enable: function() {
      this.$searchBox.removeAttr('disabled');
      return Promise.resolve();
    },

    disable: function() {
      this.$searchBox.attr('disabled', 'disabled');
      return Promise.resolve();
    },

    focus: function() {
      this.$.find('input:visible').focus();
      return Promise.resolve();
    },

    hasFocus: function() {
      return Promise.resolve(this.$.find(':focus').length > 0);
    },

    setSearchBounds: function(bounds) {
      this.searchBox.setBounds(bounds);
      return Promise.resolve();
    },

    select: function() {
      this.$.addClass('selected');
      return Promise.resolve();
    },

    deselect: function() {
      var self = this;
      return this.isSelected().then(function(isSelected) {
        if (isSelected) {
          self.$.removeClass('selected');
          self.onDeselect();
        }
      });
    },

    isSelected: function() {
      return Promise.resolve(this.$.hasClass('selected'));
    },

    getPlace: function() {
      return Promise.resolve(this.place);
    },

    setPlace: function(place) {
      var self = this;
      var prev = this.place;
      if (!Place.equal(prev, place)) {
        this.place = place;
        this.setAutocomplete(!place);

        var newValue;
        if (place) {
          newValue = Promise.resolve(place.getSingleLine());
        } else {
          newValue = this.hasFocus().then(function(hasFocus) {
            /* We only want to clear when we don't have focus because if we have
             * focus, we're actively editing the text even if it may be
             * presently invalid. */
            if (!hasFocus) {
              return '';
            }
          });
        }

        /* Since making all timeline UI asynchronous, we introduce a race
         * condition where a destination deselect starts a chain of events to
         * clear a place, then a reselect starts a chain of events to set it,
         * but since the clear includes an asynchronous focus check, it takes
         * longer to complete and can overwrite the effect of the set. So, we
         * need to queue the aftereffects. */

        this.setValueInProgress = this.setValueInProgress
          .catch($.noop)
          .then(function() {
            return newValue;
          })
          .then(function(newValue) {
            if (newValue !== undefined) {
              self.$searchBox.prop('value', newValue);
            }

            self.onPlaceChange(place, prev);
          });
        return this.setValueInProgress;
      } else {
        return Promise.resolve();
      }
    },

    setPlaceholder: function(placeholder) {
      this.$searchBox.attr('placeholder', placeholder);
      return Promise.resolve();
    },

    getValue: function() {
      return Promise.resolve(this.$searchBox.prop('value'));
    }
  },

  privates: {
    /**
     * This is a bit of a hack; Maps API does not include functionality to
     * disable autocomplete.
     */
    setAutocomplete: function(autocomplete) {
      /* True boolean comparison. We could coerce the input to boolean, but
       * this is less impactful. */
      /* jshint eqeqeq: false */
      if (this.autocomplete != autocomplete) {
      /* jshint eqeqeq: true */
        this.autocomplete = autocomplete;

        var oldBox = this.$searchBox[autocomplete? 1 : 0];
        var newBox = this.$searchBox[autocomplete? 0 : 1];

        newBox.value = oldBox.value;
        var active = global.document &&
          global.document.activeElement === oldBox;

        /* Restrict selection restoration to active elements because
         * setSelectionRange apparently takes keyboard focus away from the
         * currently focused element without actually setting it to anything,
         * and trying to restore focus afterwards doesn't work. */
        if (active && newBox.setSelectionRange) {
          //non-universal browser support
          newBox.setSelectionRange(oldBox.selectionStart, oldBox.selectionEnd);
        }

        if (autocomplete) {
          this.$.addClass('autocomplete');
        } else {
          this.$.removeClass('autocomplete');
        }

        if (active) {
          $(newBox).focus();
        }
      }
    },

    inputKey: function(e) {
      if (e.which === 13) {
        this.getValue().then(this.onSubmit).catch(debug.log);
      }
      e.stopPropagation();
    }
  },

  events: [
    'onDeselect',

    /**
     * @param event jQuery Event object for text box focus event.
     */
    'onFocus',

    /**
     * @param place
     * @param previous
     */
    'onPlaceChange',

    /**
     * @param places (array of places)
     */
    'onSearch',

    /**
     * Event fired when the enter key is pressed. This is distinct from the
     * onSearch event, which is fired when valid location properties are chosen,
     * which can happen without onSubmit in the case of an autocomplete.
     *
     * @param value the current control text.
     */
    'onSubmit'
  ],

  constants: ['$'],

  init: function(maps) {
    var self = this;

    this.setValueInProgress = Promise.resolve();

    var $searchBox = $.merge($('<input>'), $('<input>'))
      .attr('type', 'text')
      //to make dummy box consistent with search
      .attr('autocomplete', 'off');
    this.$searchBox = $searchBox;

    $searchBox[0].className = 'autocomplete';

    $searchBox.focus(this.onFocus);
    $searchBox.on('input', function() {
      self.setPlace(null);
    }).keypress(this.inputKey);

    this.$ = $('<div>')
      .addClass('destination autocomplete')
      .append($searchBox);

    this.searchBox = new maps.places.SearchBox($searchBox[0]);

    this.autocomplete = true;

    maps.event.addListener(this.searchBox, 'places_changed', function() {
      self.onSearch(self.searchBox.getPlaces().map(function(result) {
        return new Place(result);
      }));
    });
  }
});

module.exports = DestinationSearch;