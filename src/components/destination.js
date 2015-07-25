var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var Destination = defineClass({
  publics: {
    setSearchBounds: function(bounds) {
      this.searchBox.setBounds(bounds);
    },

    setPlaceholder: function(placeholder) {
      this.$searchBox.attr('placeholder', placeholder);
    }
  },

  events: [
    /**
     * @param places (array of places)
     */
    'onSearch'
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

    this.$ = $('<div>').addClass('destination')
      .append($searchBox);

    this.searchBox = new maps.places.SearchBox($searchBox[0]);

    maps.event.addListener(this.searchBox, 'places_changed', function() {
      destination.onSearch(destination.searchBox.getPlaces());
    });
  }
});

module.exports = Destination;