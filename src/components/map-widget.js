// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var Place = require('../place');
var DestinationInfo = require('./destination-info');
var DestinationMarker = require('./destination-marker');

var describeDestination = require('../describe-destination');

//named destination marker clients
var SEARCH_CLIENT = 'search';

var MapWidget = defineClass({
  publics: {
    getBounds: function() {
      return this.map.getBounds();
    },

    addControls: function(controlPosition, $controls) {
      var controls = this.map.controls[controlPosition];
      $controls.each(function() {
        controls.push(this);
      });
    },

    bindDestinations: function(destinations) {
      if (this.destinations) {
        this.destinations.onAdd.remove(this.handleDestinationAdd);
        this.destinations.onRemove.remove(this.handleDestinationRemove);
      }

      this.destinations = destinations;

      if (destinations) {
        destinations.onAdd.add(this.handleDestinationAdd);
        destinations.onRemove.add(this.handleDestinationRemove);
      }
    },

    getSelectedDestination: function() {
      return this.selectedDestination;
    },

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

    deselectDestination: function() {
      if (this.selectedDestination) {
        this.selectedDestination.deselect();
      }
    },

    fitAll: function() {
      var geoms = [];

      function addToGeoms() {
        geoms.push({ location: this });
      }

      this.destinations.each(function() {
        if (this.hasPlace()) {
          if (this.leg && this.leg.sync) {
            $.each(this.leg.sync.routes[0]['overview_path'], addToGeoms);
          }
          geoms.push(this.getPlace().getGeometry());
        }
      });

      this.ensureGeomsVisible(geoms);
    },

    ensureVisible: function(place) {
      this.ensureGeomsVisible([place.getGeometry()]);
    },

    invalidateSize: function() {
      this.maps.event.trigger(this.map, 'resize');
    },

    /**
     * @return whether or not location selection is now enabled. Location
     *  selection can only be enabled when a destination slot has been selected.
     */
    enableLocationSelection: function() {
      if (this.selectedDestination) {
        this.map.setOptions({ draggableCursor: 'auto' });
        this.locationSelectionEnabled = true;
        return true;
      }
      return false;
    },

    disableLocationSelection: function() {
      this.map.setOptions({ draggableCursor: null });
      this.locationSelectionEnabled = false;
    },

    createPlacesService: function() {
      return new this.maps.places.PlacesService(this.map);
    },

    showSearchResults: function(results) {
      var self = this;

      this.clearSearchMarkers();
      this.closeActiveInfoWindow();

      this.fitGeoms(results.map(function(result) {
        return result.geometry;
      }));

      var dest = this.selectedDestination;
      if (results.length === 1 && dest) {
        /* It would be nice if we could distinguish between an autocomplete
         * click and a normal search so that we don't overwrite the search box
         * text for the autocomplete click.*/
        dest.setPlace(new Place(results[0]));
      } else if (results.length > 0) {
        $.each(results, function(i, result) {
          var place = new Place(result);

          var marker = self.getOrCreateMarker(place, SEARCH_CLIENT,
            DestinationMarker.color.RED, null, false);
          self.searchMarkers.push(marker);

          marker.onClick.add(marker.restrictListenerToClient(function() {
            var dest = self.selectedDestination;
            if (dest) {
              dest.setPlace(place);
            }
          }));

          marker.deprioritizeClient();
        });
      }
    }
  },

  privates: {
    handleDestinationAdd: function(destination) {
      var self = this;

      this.destMeta.set(destination, {});

      destination.onPlaceChange.add(function(place) {
        self.handleDestinationPlaceChange(destination, place);
      });
      destination.onDeselect.add(function() {
        self.handleDestinationDeselect(destination);
      });
      destination.onSelect.add(function() {
        self.handleDestinationSelect(destination);
      });

      if (destination.hasNext()) {
        this.updateLeg(destination.getNext());
      }

      return destination;
    },

    handleDestinationRemove: function(destination) {
      var meta = this.destMeta.get(destination);

      if (meta.unbindMarker) {
        meta.unbindMarker();
      }

      if (meta.leg) {
        meta.leg.clear();
      }

      var next = this.destinations.get(destination.getIndex());
      if (next) {
        this.updateLeg(next);
      }

      destination.deselect();

      this.destMeta.delete(destination);
    },

    getOrCreateMarker: function(place, client, color, mergePredicate, update) {
      var self = this;

      var key = place.toKey();

      var marker = this.markers[key];
      if (marker) {
        if (!mergePredicate || mergePredicate(marker)) {
          marker.pushClient(client, color, update);
        } else {
          marker = null;
        }
      } else {
        marker = new DestinationMarker(this.maps, this.map, place,
          client, color);

        if (place.hasDetails()) {
          marker.onClick.add(function() {
            self.showDestinationInfo(marker);
          }, true);
        }

        this.markers[key] = marker;
        marker.onClear.add(function() {
          delete self.markers[key];
        });
      }

      return marker;
    },

    bindDestinationMarker: function(destination) {
      var self = this;

      var place = destination.getPlace();

      var marker = this.getOrCreateMarker(place, destination,
        this.getAppropriateDestinationMarkerColor(destination),
        function(marker) {
          return !marker.hasClient(destination);
        });

      if (!marker) {
        return;
      }

      marker.onClick.add(destination.select);
      function handleSelection() {
        marker.setColor(self.getAppropriateDestinationMarkerColor(destination));
      }
      destination.onSelect.add(handleSelection);
      destination.onDeselect.add(handleSelection);

      function handleOrdinalChange() {
        describeDestination.decorateMarker(marker, destination);
      }

      destination.onOrdinalChange.add(handleOrdinalChange);
      handleOrdinalChange();

      var meta = this.destMeta.get(destination);

      function unbind() {
        marker.removeClient(destination);
        marker.onClick.remove(destination.select);
        destination.onSelect.remove(handleSelection);
        destination.onDeselect.remove(handleSelection);
        destination.onOrdinalChange.remove(handleOrdinalChange);
        destination.onPlaceChange.remove(handlePlaceChange);
        if (meta.unbindMarker === unbind) {
          delete meta.unbindMarker;
        }
      }

      meta.unbindMarker = unbind;

      function handlePlaceChange(newPlace) {
        if ((place && place.toKey()) !== (newPlace && newPlace.toKey())) {
          unbind();
        }
      }

      destination.onPlaceChange.add(handlePlaceChange);
    },

    getAppropriateDestinationMarkerColor: function(destination) {
      return destination.isSelected()?
        DestinationMarker.color.GREEN : DestinationMarker.color.BLUE;
    },

    showDestinationInfo: function(destinationMarker) {
      if (!this.info) {
        this.info = new DestinationInfo(
          this.maps, this.map, destinationMarker.place);
      } else {
        this.info.setPlace(destinationMarker.place);
      }

      this.info.show(destinationMarker.marker);
    },

    handleDestinationPlaceChange: function(destination, place) {
      if (place) {
        this.bindDestinationMarker(destination);
      }

      if (destination.getPrevious()) {
        this.updateLeg(destination);
      }
      if (destination.getNext()) {
        this.updateLeg(destination.getNext());
      }
    },

    handleDestinationDeselect: function(destination) {
      this.selectedDestination = null;
      destination.onPlaceChange.remove(
        this.handleSelectedDestinationPlaceChange);
      this.disableLocationSelection();
    },

    handleDestinationSelect: function(destination) {
      this.deselectDestination();

      this.selectedDestination = destination;
      destination.onPlaceChange.add(this.handleSelectedDestinationPlaceChange);
      this.handleSelectedDestinationPlaceChange(destination.getPlace());
    },

    handleSelectedDestinationPlaceChange: function(place) {
      if (place) {
        this.disableLocationSelection();
        this.ensureVisible(place);
      } else {
        this.enableLocationSelection();
      }
    },

    updateLeg: function(destination) {
      var self = this;
      var maps = this.maps;
      var map = this.map;

      var a = destination.getPrevious().getPlace();
      var b = destination.getPlace();

      var meta = this.destMeta.get(destination);

      var leg = meta.leg;
      if (leg) {
        if (leg.async) {
          leg.async.reject();
        }
        leg.clear();
      } else {
        var renderer = new maps.DirectionsRenderer({
          preserveViewport: true,
          suppressMarkers: true
        });
        meta.leg = leg = {
          renderer: renderer,
          clear: function() {
            // setMap(null) seems to be the best way to clear the nav route
            renderer.setMap(null);
          }
        };
      }

      if (a && b) {
        var request = {
          origin: a.getLocation(),
          destination: b.getLocation(),
          travelMode: maps.TravelMode.DRIVING // TODO(rosswang): user choice
        };

        leg.async = $.Deferred();

        this.directionsService.route(request, function(result, status) {
          if (status === maps.DirectionsStatus.OK) {
            leg.async.resolve(result);
            leg.sync = result;
          } else {
            self.onError({ directionsStatus: status });
            leg.async.reject(status);
          }
        });

        leg.async.done(function(result) {
          leg.renderer.setDirections(result);
          leg.renderer.setMap(map);
        });
      }
    },

    centerOnCurrentLocation: function(navigator) {
      var self = this;
      var maps = this.maps;
      var map = this.map;

      // https://developers.google.com/maps/documentation/javascript/examples/map-geolocation
      if (navigator && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
          var latLng = new maps.LatLng(
            position.coords.latitude, position.coords.longitude);
          map.setCenter(latLng);

          self.geocoder.geocode({ location: latLng },
            function(results, status) {
              var origin = self.destinations.get(0);
              if (status === maps.GeocoderStatus.OK &&
                  origin && !origin.hasPlace()) {
                origin.setPlace(new Place(results[0]));
              }
            });
          });
      }
    },

    ensureGeomsVisible: function(geoms) {
      var curBounds = this.map.getBounds();
      if (!geoms.every(function(geom) {
            return curBounds.contains(geom.location);
          })) {
        this.fitGeoms(geoms);
      }
    },

    fitGeoms: function(geoms) {
      var curBounds = this.map.getBounds();
      var curSize = curBounds.toSpan();
      function wontShrink(proposed) {
        var size = proposed.toSpan();
        return size.lat() >= curSize.lat() || size.lng() >= curSize.lng();
      }

      if (geoms.length === 1) {
        var geom = geoms[0];
        if (geom.viewport && wontShrink(geom.viewport)) {
          this.map.fitBounds(geom.viewport);
        } else {
          this.map.panTo(geom.location);
        }

      } else if (geoms.length > 1) {
        this.map.fitBounds(geoms.reduce(function(acc, geom) {
          if (geom.viewport) {
            acc.union(geom.viewport);
          } else {
            acc.extend(geom.location);
          }
          return acc;
        }, new this.maps.LatLngBounds()));
      }
    },

    selectLocation: function(latLng) {
      var self = this;
      var maps = this.maps;

      var dest = this.selectedDestination;
      if (dest) {
        if (this.locationSelectionEnabled) {
          self.geocoder.geocode({ location: latLng },
            function(results, status) {
              if (status === maps.GeocoderStatus.OK) {
                dest.setPlace(new Place(results[0]));

                /* If we've just picked a location like this, we probably don't
                 * care about search results anymore. */
                self.clearSearchMarkers();
              }
            });
        } else {
          dest.deselect();
          this.closeActiveInfoWindow();
        }
      }
    }
  },

  constants: ['$', 'maps'],
  events: {
    /**
     * @param bounds
     */
    onBoundsChange: '',

    /**
     * @param error A union with one of the following keys:
     *  directionsStatus
     */
    onError: 'memory'
  },

  // https://developers.google.com/maps/documentation/javascript/tutorial
  init: function(opts) {
    opts = opts || {};
    var self = this;

    var maps = opts.maps || global.google.maps;
    var navigator = opts.navigator || global.navigator;

    this.maps = maps;
    this.navigator = opts.navigator || global.navigator;
    this.geocoder = opts.geocoder || new maps.Geocoder();
    this.directionsService = new maps.DirectionsService();

    this.$ = $('<div>').addClass('map-canvas');

    this.searchMarkers = [];
    this.markers = {};
    this.destMeta = new Map();

    this.initialConfig = {
      center: new maps.LatLng(37.4184, -122.0880), //Googleplex
      zoom: 11
    };

    var map = new maps.Map(this.$[0], this.initialConfig);
    this.map = map;

    maps.event.addListener(map, 'click', function(e) {
      self.selectLocation(e.latLng);
    });
    maps.event.addListener(map, 'bounds_changed', function() {
      self.onBoundsChange(map.getBounds());
    });

    this.centerOnCurrentLocation(navigator);
  }
});

module.exports = MapWidget;
