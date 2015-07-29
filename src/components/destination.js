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
      var normalized = this.normalizeDestination(placeDesc);

      if (normalized && updateSearchBox !== false) {
        this.$searchBox.prop('value', normalized.display);
      }

      this.place = normalized && normalized.place;
      this.onSet(normalized);
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
     */
    'onSet'
  ],

  constants: ['$'],

  init: function(maps, placeholder, initial) {
    var destination = this;

    var $searchBox = $('<input>')
      .attr('type', 'text');
    this.$searchBox = $searchBox;

    this.setPlaceholder(placeholder);

    if (initial) {
      $searchBox.prop('value', initial);
    }

    $searchBox.focus(this.onFocus);
    $searchBox.on('input', function() {
      destination.set(null, false);
    });

    this.$ = $('<div>').addClass('destination')
      .append($searchBox);

    this.searchBox = new maps.places.SearchBox($searchBox[0]);

    maps.event.addListener(this.searchBox, 'places_changed', function() {
      destination.onSearch(destination.searchBox.getPlaces());
    });

    /* TODO(rosswang): can we for the love of squirrels stop the autocomplete
     * from popping up after a location has been selected through a map click?
     */
  }
});

module.exports = Destination;