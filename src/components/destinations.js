var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var strings = require('../strings').currentLocale;

var Destination = require('./destination');

var Destinations = defineClass({
  publics: {
    append: function(destinationName) {
      var placeholder;
      switch (this.destinations.length) {
        case 0:
          placeholder = strings['Origin'];
          break;
        case 1:
          placeholder = strings['Destination'];
          break;
        case 2:
          this.destinations[1].setPlaceholder(strings.destination(1));
          /* falls through */
        default:
          placeholder = strings.destination(this.destinations.length);
      }

      var destination = new Destination(
        this.maps, placeholder, destinationName);
      this.$destContainer.append(destination.$);
      this.destinations.push(destination);
      var prev = this.destinations[this.destinations.length - 2];
      if (prev) {
        prev.bindNext(destination);
      }
      this.onDestinationAdded(destination);

      return destination;
    },

    /**
     * @param handler callback receiving a <code>Destination</code> instance
     *  each time a <code>Destination</code> is added. On initial add, the
     *  callback is called with all current <code>Destination</code>s.
     */
    addDestinationBindingHandler: function(handler) {
      this.onDestinationAdded.add(handler);
      $.each(this.destinations, function(i, destination) {
        handler(destination);
      });
    },

    getDestinations: function() {
      return this.destinations.slice(0);
    }
  },

  events: {
    /**
     * @param destination Destination instance
     */
    onDestinationAdded: 'private'
  },

  constants: ['$'],

  init: function(maps, initial) {
    var self = this;

    this.maps = maps;
    this.$ = $('<form>').addClass('destinations');
    this.$destContainer = $('<div>');
    this.$.append(this.$destContainer);

    $('<div>')
      .addClass('add-bn')
      .text('+')
      .click(function() {
        self.append().focus();
      })
      .appendTo(this.$);

    this.destinations = [];

    initial = initial || [];

    for (var i = 0; i < Math.max(initial.length, 2); i++) {
      this.append(initial[i]);
    }
  }
});

module.exports = Destinations;