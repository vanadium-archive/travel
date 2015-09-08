// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var vdlTravel = require('../../ifc');

var Place = require('../place');

module.exports = {
  box: function(i) {
    return i === undefined || i === null? i : new vdlTravel.Int16({ value: i });
  },

  unbox: function(ifc) {
    return ifc && ifc.value;
  },

  toPlace: function(dependencies, ifc) {
    return ifc? Place.fromObject(dependencies, ifc) : Promise.resolve();
  },

  fromPlace: function(place) {
    return place && new vdlTravel.Place(place.toObject());
  },

  toLatLng: function(maps, ifc) {
    return new maps.LatLng(ifc.lat, ifc.lng);
  },

  fromLatLng: function(latlng) {
    return new vdlTravel.LatLng({
      lat: latlng.lat(),
      lng: latlng.lng()
    });
  },

  toLatLngBounds: function(maps, ifc) {
    return new maps.LatLngBounds(
      module.exports.toLatLng(maps, ifc.sw),
      module.exports.toLatLng(maps, ifc.ne));
  },

  fromLatLngBounds: function(bounds) {
    return new vdlTravel.LatLngBounds({
      sw: module.exports.fromLatLng(bounds.getSouthWest()),
      ne: module.exports.fromLatLng(bounds.getNorthEast())
    });
  }
};