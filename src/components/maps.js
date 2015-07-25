var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var Destinations = require('./destinations');
var Messages = require('./messages');

var Widget = defineClass({
  publics: {
    clearMarkers: function() {
      var markers = this.markers;
      this.markers = [];
      $.each(markers, function(i, marker) {
        marker.setMap(null);
      });
    },

    closeActiveInfoWindow: function() {
      if (this.activeInfoWindow) {
        this.activeInfoWindow.close();
      }
      this.activeInfoWindow = null;
    },

    message: function(message) {
      this.messages.push(message);
    }
  },

  privates: {
    destinationSelectionWindow: defineClass.innerClass({
      privates: {
        renderInfo: function() {
          var $info = $('<div>').addClass('destination-info');

          $info.append($('<div>')
            .addClass('title')
            .text(this.place.name));

          return $info[0];
        }
      },

      init: function(place, createMarker) {
        var widget = this.outer;
        var maps = widget.maps;
        var map = widget.map;

        this.place = place;

        var infoWindow = new maps.InfoWindow({
          content: this.renderInfo(),
          position: place.geometry.location
        });

        var marker;
        if (createMarker) {
          marker = new maps.Marker({
            map: map,
            title: place.name,
            position: place.geometry.location
          });

          maps.event.addListener(marker, 'click', function() {
            widget.setActiveInfoWindow(infoWindow, marker);
          });

          widget.markers.push(marker);
        } else {
          widget.setActiveInfoWindow(infoWindow);
        }
      }
    }),

    setActiveInfoWindow: function(infoWindow, marker) {
      this.closeActiveInfoWindow();
      this.activeInfoWindow = infoWindow;
      infoWindow.open(this.map, marker);
    },

    centerOnCurrentLocation: function() {
      var maps = this.maps;
      var map = this.map;

      // https://developers.google.com/maps/documentation/javascript/examples/map-geolocation
      if (global.navigator && global.navigator.geolocation) {
        global.navigator.geolocation.getCurrentPosition(function(position) {
          map.setCenter(new maps.LatLng(position.coords.latitude,
            position.coords.longitude));
        });
      }
    },

    bindDestinationControl: function (destination) {
      var widget = this;
      var maps = this.maps;
      var map = this.map;

      maps.event.addListener(map, 'bounds_changed', function() {
        destination.setSearchBounds(map.getBounds());
      });

      destination.onSearch.add(function(places) {
        widget.clearMarkers();
        widget.closeActiveInfoWindow();
        var bounds = new maps.LatLngBounds();

        if (places.length === 1) {
          var place = places[0];
          widget.destinationSelectionWindow(place, false);

          map.setCenter(place.geometry.location);
        } else if (places.length > 1) {
          $.each(places, function(i, place) {
            widget.destinationSelectionWindow(place, true);
            bounds.extend(place.geometry.location);
          });

          map.fitBounds(bounds);
        }
      });
    }
  },

  constants: ['$', 'maps'],

  // https://developers.google.com/maps/documentation/javascript/tutorial
  init: function(maps) {
    this.maps = maps = maps || global.google.maps;

    this.$ = $('<div>').addClass('map-canvas');

    this.markers = [];
    this.route = {};

    this.messages = new Messages();
    this.destinations = new Destinations(maps);

    var config = {
      zoom: 11,
      center: new maps.LatLng(37.4184, -122.0880) //Googleplex
    };

    var map = new maps.Map(this.$[0], config);
    this.map = map;

    this.centerOnCurrentLocation();

    var controls = map.controls;

    this.destinations.addDestinationBindingHandler(
      $.proxy(this, 'bindDestinationControl'));

    controls[maps.ControlPosition.TOP_LEFT].push(this.destinations.$[0]);
    controls[maps.ControlPosition.TOP_CENTER].push(this.messages.$[0]);
  }
});

module.exports = Widget;
