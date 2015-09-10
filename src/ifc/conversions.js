// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var vdlTravel = require('../../ifc');

var Place = require('../place');

var x = {
  box: function(i) {
    return i === undefined || i === null? i : new vdlTravel.Int16({ value: i });
  },

  unbox: function(ifc) {
    return ifc && ifc.value;
  },

  toPlace: function(maps, ifc) {
    return ifc && new Place({
      'place_id': ifc.placeId,
      geometry: {
        location: x.toLatLng(maps, ifc.location),
        viewport: x.toLatLngBounds(maps, ifc.viewport)
      },
      'formatted_address': ifc.formattedAddress,
      name: ifc.name
    });
  },

  fromPlace: function(place) {
    if (!place) {
      return place;
    }

    var placeObj = place.getPlaceObject();
    var details = place.getDetails();
    return new vdlTravel.Place({
      placeId: placeObj.placeId,
      location: x.fromLatLng(place.getLocation()),
      viewport: place.getGeometry().viewport,
      formattedAddress: details && details['formatted_address'] ||
        placeObj.query,
      name: details && details.name
    });
  },

  toLatLng: function(maps, ifc) {
    return ifc && new maps.LatLng(ifc.lat, ifc.lng);
  },

  fromLatLng: function(latlng) {
    return latlng && new vdlTravel.LatLng({
      lat: latlng.lat(),
      lng: latlng.lng()
    });
  },

  toLatLngBounds: function(maps, ifc) {
    return ifc && new maps.LatLngBounds(
      x.toLatLng(maps, ifc.sw),
      x.toLatLng(maps, ifc.ne));
  },

  fromLatLngBounds: function(bounds) {
    return bounds && new vdlTravel.LatLngBounds({
      sw: x.fromLatLng(bounds.getSouthWest()),
      ne: x.fromLatLng(bounds.getNorthEast())
    });
  }
};

module.exports = x;