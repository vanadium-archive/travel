// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var strings = require('../strings').currentLocale;

var DestinationControl = defineClass({
  publics: {
    focus: function() {
      this.$.find('input:visible').focus();
    },

    hasFocus: function() {
      return this.$.find(':focus').length > 0;
    },

    setSearchBounds: function(bounds) {
      this.searchBox.setBounds(bounds);
    },

    selectControl: function() {
      if (this.destination) {
        this.destination.select();
      }
    },

    deselectControl: function() {
      if (this.destination) {
        this.destination.deselect();
      }
    },

    bindDestination: function(destination) {
      if (this.destination) {
        this.destination.onPlaceChange.remove(this.handlePlaceChange);
        this.destination.onSelect.remove(this.handleSelect);
        this.destination.onDeselect.remove(this.handleDeselect);
        this.destination.onOrdinalChange.remove(this.updateOrdinal);
      }

      this.destination = destination;

      if (destination) {
        destination.onPlaceChange.add(this.handlePlaceChange);
        destination.onSelect.add(this.handleSelect);
        destination.onDeselect.add(this.handleDeselect);
        destination.onOrdinalChange.add(this.updateOrdinal);
      }

      this.updateOrdinal();
      this.handlePlaceChange(destination && destination.getPlace());
      if (destination && destination.isSelected()) {
        this.handleSelect();
      } else {
        this.handleDeselect();
      }
    }
  },

  privates: {
    handlePlaceChange: function(place) {
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
    },

    updateOrdinal: function() {
      var placeholder;
      var destination = this.destination;
      if (destination) {
        if (!destination.hasPrevious()) {
          placeholder = strings['Origin'];
        } else if (destination.getIndex() === 1 && !destination.hasNext()) {
          placeholder = strings['Destination'];
        } else {
          placeholder = strings.destination(destination.getIndex());
        }
      }

      this.$searchBox.attr('placeholder', placeholder);
    },

    handleSelect: function() {
      this.$.addClass('selected');
    },

    handleDeselect: function() {
      this.$.removeClass('selected');
    },

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
        if (newBox.setSelectionRange) {
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
    }
  },

  events: [
    /**
     * @param event jQuery Event object for text box focus event.
     */
    'onFocus',
    /**
     * @param places (array of places)
     */
    'onSearch'
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
      if (self.destination) {
        self.destination.setPlace(null);
      }
    });

    this.$ = $('<div>')
      .addClass('destination')
      .addClass('autocomplete')
      .append($searchBox);

    this.searchBox = new maps.places.SearchBox($searchBox[0]);

    this.autocomplete = true;

    maps.event.addListener(this.searchBox, 'places_changed', function() {
      self.onSearch(self.searchBox.getPlaces());
    });
  }
});

module.exports = DestinationControl;