// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var vdlTravel = require('../../ifc');

var Place = require('../place');

/* TODO(rosswang): We can remote getUrl out as an RPC, at least for RPC-based
 * casting. We'd need some fancy footwork with the Syncbase approach, with no
 * guarantee of resolution. */
var PLACE_PHOTO_OPTS = {
  maxHeight: 96
};

var x = {
  box: function(i, BoxedType) {
    return i === undefined || i === null? i : new BoxedType({ value: i });
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
      name: ifc.name,
      photos: ifc.photoUrl? [{
        getUrl: function() { return ifc.photoUrl; }
      }] : [],
      icon: ifc.iconUrl,
      rating: x.unbox(ifc.rating),
      priceLevel: x.unbox(ifc.priceLevel)
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
      name: details && details.name,
      photoUrl: details.photos && details.photos[0]?
        details.photos[0].getUrl(PLACE_PHOTO_OPTS) : '',
      iconUrl: details.icon || '',
      rating: x.box(details.rating, vdlTravel.Float32),
      priceLevel: x.box(details.priceLevel, vdlTravel.Byte)
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