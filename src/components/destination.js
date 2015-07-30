var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var Destination = defineClass({
  statics: {
    normalizeDestination: function(desc) {
      if (!desc) {
        return null;

      } else if (desc.geometry) {
        var place = { location: desc.geometry.location };

        //some maps API members are lower_underscore
        /* jshint camelcase: false */
        if (desc.place_id !== undefined) {
          place.placeId = desc.place_id;
        } else {
          place.query = desc.formatted_address;
        }

        var display = desc.name &&
          desc.name !== desc.formatted_address.split(', ')[0]?
          desc.name + ', ' + desc.formatted_address : desc.formatted_address;
        /* jshint camelcase: true */

        return {
          place: place,
          details: desc,
          display: display
        };

      } else {
        return {
          place: desc,
          display : desc.query || desc.location.toString()
        };
      }
    }
  },

  publics: {
    focus: function() {
      this.$.find('input:visible').focus();
    },

    setSearchBounds: function(bounds) {
      this.searchBox.setBounds(bounds);
    },

    setPlaceholder: function(placeholder) {
      this.$searchBox.attr('placeholder', placeholder);
    },

    selectControl: function() {
      this.$.addClass('selected');
    },

    deselectControl: function() {
      this.$.removeClass('selected');
    },

    getPlace: function() {
      return this.place;
    },

    set: function(placeDesc, updateSearchBox) {
      var prev = this.place;
      var normalized = this.normalizeDestination(placeDesc);

      this.setAutocomplete(!normalized);

      if (normalized && updateSearchBox !== false) {
        this.$searchBox.prop('value', normalized.display);
      }

      this.place = normalized && normalized;
      this.onSet(normalized, prev);
    },

    getNext: function() {
      return this.next;
    },

    bindNext: function(next) {
      if (this.next !== next) {
        this.next = next;
        next.bindPrevious(this.ifc);
      }
    },

    getPrevious: function() {
      return this.prev;
    },

    bindPrevious: function(prev) {
      if (this.prev !== prev) {
        this.prev = prev;
        prev.bindNext(this.ifc);
      }
    }
  },

  privates: {
    /**
     * This is a bit of a hack; Maps API does not include functionality to
     * disable autocomplete.
     */
    setAutocomplete: function(autocomplete) {
      if (this.autocomplete !== autocomplete) {
        this.autocomplete = autocomplete;

        var oldBox = this.$searchBox[autocomplete? 1 : 0],
            newBox = this.$searchBox[autocomplete? 0 : 1];

        newBox.value = oldBox.value;
        var active = global.document &&
          global.document.activeElement === oldBox;
        newBox.setSelectionRange(oldBox.selectionStart, oldBox.selectionEnd);

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
    'onSearch',
    /**
     * fired when the destination has been set to a place, or cleared.
     * @param place the new destination, as a normalized place.
     * @param previous the old destination, as a normalized place.
     */
    'onSet'
  ],

  constants: ['$'],

  init: function(maps, placeholder, initial) {
    var destination = this;

    var $searchBox = $.merge($('<input>'), $('<input>'))
      .attr('type', 'text')
      //to make dummy box consistent with search
      .attr('autocomplete', 'off');
    this.$searchBox = $searchBox;

    $searchBox[0].className = 'autocomplete';

    this.setPlaceholder(placeholder);

    if (initial) {
      $searchBox.prop('value', initial);
    }

    $searchBox.focus(this.onFocus);
    $searchBox.on('input', function() {
      destination.set(null, false);
    });

    this.$ = $('<div>')
      .addClass('destination')
      .addClass('autocomplete')
      .append($searchBox);

    this.searchBox = new maps.places.SearchBox($searchBox[0]);

    this.autocomplete = true;

    maps.event.addListener(this.searchBox, 'places_changed', function() {
      destination.onSearch(destination.searchBox.getPlaces());
    });
  }
});

module.exports = Destination;