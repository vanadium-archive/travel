// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var DestinationSearch = defineClass({
  publics: {
    clear: function() {
      this.setPlace(null);
      this.$searchBox.prop('value', '');
    },

    enable: function() {
      this.$searchBox.removeAttr('disabled');
    },

    disable: function() {
      this.$searchBox.attr('disabled', 'disabled');
    },

    focus: function() {
      this.$.find('input:visible').focus();
    },

    hasFocus: function() {
      return this.$.find(':focus').length > 0;
    },

    setSearchBounds: function(bounds) {
      this.searchBox.setBounds(bounds);
    },

    select: function() {
      this.$.addClass('selected');
    },

    deselect: function() {
      if (this.isSelected()) {
        this.$.removeClass('selected');
        this.onDeselect();
      }
    },

    isSelected: function() {
      return this.$.hasClass('selected');
    },

    getPlace: function() {
      return this.place;
    },

    setPlace: function(place) {
      var prev = this.place;
      if (prev !== place) {
        this.place = place;
        this.setAutocomplete(!place);

        var newValue;
        if (place) {
          newValue = place.getSingleLine();
        } else if (!this.hasFocus()) {
          newValue = '';
        }
        if (newValue !== undefined) {
          this.$searchBox.prop('value', newValue);
        }

        this.onPlaceChange(place, prev);
      }
    },

    setPlaceholder: function(placeholder) {
      this.$searchBox.attr('placeholder', placeholder);
    },

    getValue: function() {
      return this.$searchBox.prop('value');
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
        this.onSubmit(this.getValue());
      }
    }
  },

  events: [
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

    'onDeselect',

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
      self.onSearch(self.searchBox.getPlaces());
    });
  }
});

module.exports = DestinationSearch;