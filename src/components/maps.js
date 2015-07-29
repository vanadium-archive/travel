var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var Destinations = require('./destinations');
var DestinationInfo = require('./destination-info');
var DestinationMarker = require('./destination-marker');
var Messages = require('./messages');

var normalizeDestination = require('./destination').normalizeDestination;

//named destination marker clients
var SEARCH_CLIENT = 'search';

var Widget = defineClass({
  publics: {
    clearSearchMarkers: function() {
      $.each(this.searchMarkers, function() {
        this.removeClient(SEARCH_CLIENT);
      });
      this.searchMarkers = [];
    },

    closeActiveInfoWindow: function() {
      if (this.info) {
        this.info.close();
      }
    },

    deselectDestinationControl: function() {
      if (this.selectedDestinationControl) {
        this.selectedDestinationControl.deselectControl();
        this.selectedDestinationControl = null;
        this.disableLocationSelection();
        this.clearSearchMarkers();
        this.closeActiveInfoWindow();
      }
    },

    fitAllDestinations: function() {
      var points = this.destinations.getDestinations()
        .map(function(dest) { return dest.getPlace(); })
        .filter(function(place) { return place; })
        .reduce(function(acc, place) {
          acc.push(place.location);
          return acc;
        }, []);

      var curBounds = this.map.getBounds();
      if (points.every(function(point) { return curBounds.contains(point); })) {
        return;
      }

      if (points.length === 1) {
        this.map.panTo(points[0]);
      } else if (points.length > 1) {
        this.map.fitBounds(points.reduce(function(acc, point) {
          acc.extend(point);
          return acc;
        }, new this.maps.LatLngBounds()));
      }
    },

    message: function(message) {
      this.messages.push(message);
    }
  },

  privates: {
    createMarker: function(normalizedPlace, client, color) {
      var marker = new DestinationMarker(this.maps, this.map, normalizedPlace,
        client, color);

      if (normalizedPlace.details) {
        marker.onClick.add($.proxy(this, 'showDestinationInfo', marker), true);
      }

      return marker;
    },

    createDestinationMarker: function(normalizedPlace, destinationControl) {
      var marker = this.createMarker(normalizedPlace, destinationControl,
        this.getAppropriateDestinationMarkerColor(destinationControl));
      destinationControl.marker = marker;
      marker.onClick.add(
        $.proxy(this, 'selectDestinationControl', destinationControl));

      return marker;
    },

    showDestinationInfo: function(destinationMarker) {
      if (!this.info) {
        this.info = new DestinationInfo(
          this.maps, this.map, destinationMarker.normalizedPlace.details);
      } else {
        this.info.setDetails(destinationMarker.normalizedPlace.details);
      }

      this.info.show(destinationMarker.marker);
    },

    getAppropriateDestinationMarkerColor: function(destination) {
      return destination === this.selectedDestinationControl?
        DestinationMarker.color.GREEN : DestinationMarker.color.BLUE;
    },

    associateDestinationMarker: function(destination, marker) {
      if (destination.marker === marker) {
        return;
      }

      if (destination.marker) {
        destination.marker.removeClient(destination);
      }

      destination.marker = marker;

      if (marker) {
        marker.pushClient(destination,
          this.getAppropriateDestinationMarkerColor(destination));
        marker.onClick.add(
          $.proxy(this, 'selectDestinationControl', destination));
      }
    },

    handleDestinationSet: function(destination, normalizedPlace) {
      if (destination.marker) {
        if (!normalizedPlace) {
          this.associateDestinationMarker(destination, null);
          this.enableLocationSelection();
        }
        /* Else assume we've just updated the marker explicitly via
         * associateDestationMarker. Corollary: be sure to call that... */
      } else if (normalizedPlace) {
        this.createDestinationMarker(normalizedPlace, destination);
      }

      if (normalizedPlace) {
        this.disableLocationSelection();
      }
    },

    centerOnCurrentLocation: function() {
      var widget = this;
      var maps = this.maps;
      var map = this.map;

      // https://developers.google.com/maps/documentation/javascript/examples/map-geolocation
      if (global.navigator && global.navigator.geolocation) {
        global.navigator.geolocation.getCurrentPosition(function(position) {
          var latLng = new maps.LatLng(
            position.coords.latitude, position.coords.longitude);
          map.setCenter(latLng);

          widget.geocoder.geocode({ location: latLng },
            function(results, status) {
              if (status === maps.GeocoderStatus.OK) {
                var result = results[0];
                var origin = widget.destinations.getDestinations()[0];
                var marker = widget.createDestinationMarker(
                  normalizeDestination(result), origin);

                marker.onClick.add(function listener() {
                  origin.set(result);
                  marker.onClick.remove(listener);
                });
              }
            });
          });
      }
    },

    bindDestinationControl: function (destination) {
      var maps = this.maps;
      var map = this.map;

      maps.event.addListener(map, 'bounds_changed', function() {
        destination.setSearchBounds(map.getBounds());
      });

      destination.onFocus.add(
        $.proxy(this, 'selectDestinationControl', destination));
      destination.onSearch.add($.proxy(this, 'showDestinationSearchResults'));
      destination.onSet.add($.proxy(this, 'handleDestinationSet', destination));
    },

    enableLocationSelection: function() {
      this.map.setOptions({ draggableCursor: 'auto' });
      this.locationSelectionEnabled = true;
    },

    disableLocationSelection: function() {
      this.map.setOptions({ draggableCursor: null });
      this.locationSelectionEnabled = false;
    },

    selectDestinationControl: function(dest) {
      if (dest !== this.selectedDestinationControl) {
        var prevDest = this.selectedDestinationControl;
        if (prevDest && prevDest.marker) {
          prevDest.marker.setColor(DestinationMarker.color.BLUE);
        }
        this.deselectDestinationControl();

        this.selectedDestinationControl = dest;
        dest.selectControl();

        if (dest.marker) {
          dest.marker.setColor(DestinationMarker.color.GREEN);
        }

        var place = dest.getPlace();
        if (place) {
          this.fitAllDestinations();
        } else {
          this.enableLocationSelection();
        }
      }
    },

    showDestinationSearchResults: function(places) {
      var widget = this;

      this.clearSearchMarkers();
      this.closeActiveInfoWindow();

      if (places.length === 1) {
        var place = places[0];
        this.map.panTo(place.geometry.location);
        /* It would be nice if we could distinguish between an autocomplete
         * click and a normal search so that we don't overwrite the search box
         * text for the autocomplete click.*/
        var dest = this.selectedDestinationControl;
        if (dest) {
          dest.set(place);
        }
      } else if (places.length > 1) {
        var bounds = new this.maps.LatLngBounds();

        $.each(places, function(i, place) {
          var marker = widget.createMarker(normalizeDestination(place),
            SEARCH_CLIENT, DestinationMarker.color.RED);
          widget.searchMarkers.push(marker);

          marker.onClick.add(function() {
            var dest = widget.selectedDestinationControl;
            if (dest) {
              widget.associateDestinationMarker(dest, marker);
              dest.set(place);
            }
          });

          bounds.extend(place.geometry.location);
        });

        this.map.fitBounds(bounds);
      }
    },

    selectLocation: function(latLng) {
      var widget = this;
      var maps = this.maps;

      var dest = this.selectedDestinationControl;
      if (dest && this.locationSelectionEnabled) {
        widget.geocoder.geocode({ location: latLng },
          function(results, status) {
            if (status === maps.GeocoderStatus.OK) {
              widget.associateDestinationMarker(dest, null);
              dest.set(results[0]);
            }
          });
      }
    }
  },

  constants: ['$', 'maps'],

  // https://developers.google.com/maps/documentation/javascript/tutorial
  init: function(opts) {
    opts = opts || {};
    var widget = this;

    var maps = opts.maps || global.google.maps;
    this.maps = maps;
    this.navigator = opts.navigator || global.navigator;
    this.geocoder = new maps.Geocoder();

    this.$ = $('<div>').addClass('map-canvas');

    this.searchMarkers = [];
    this.route = {};

    this.initialConfig = {
      center: new maps.LatLng(37.4184, -122.0880), //Googleplex
      zoom: 11
    };

    var map = new maps.Map(this.$[0], this.initialConfig);
    this.map = map;

    this.messages = new Messages();
    this.destinations = new Destinations(maps);

    this.destinations.addDestinationBindingHandler(
      $.proxy(this, 'bindDestinationControl'));

    maps.event.addListener(map, 'click', function(e) {
      widget.selectLocation(e.latLng);
    });

    this.centerOnCurrentLocation();

    var controls = map.controls;
    controls[maps.ControlPosition.TOP_LEFT].push(this.destinations.$[0]);
    controls[maps.ControlPosition.TOP_CENTER].push(this.messages.$[0]);
  }
});

module.exports = Widget;
