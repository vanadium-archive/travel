// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var defineClass = require('../util/define-class');

var getTripLength = require('./get-trip-length');

var ComparableTrip = defineClass({
  publics: {
    getLength: function() {
      if (this.length === undefined) {
        this.length = getTripLength(this.trip);
      }

      return this.length;
    }
  },

  constants: [ 'trip', 'id', 'latestSwitch' ],

  init: function(trip, id, latestSwitch) {
    this.trip = trip;
    this.id = id;
    this.latestSwitch = latestSwitch;
  }
});

function nullOrUndefined(a) {
  return a === null || a === undefined;
}

function wellDefinedFirst(a, b) {
  return !nullOrUndefined(a) && nullOrUndefined(b)? -1 :
         nullOrUndefined(a) && !nullOrUndefined(b)? 1 : 0;
}

function greatestFirst(a, b) {
  return a > b? -1 :
         a < b? 1 : 0;
}

function greatestDefinedFirst(a, b) {
  return greatestFirst(a, b) || wellDefinedFirst(a, b);
}

function latestSwitchFirst(cta, ctb) {
  return greatestDefinedFirst(cta.latestSwitch, ctb.latestSwitch);
}

function longestTripFirst(cta, ctb) {
  return greatestFirst(cta.getLength(), ctb.getLength());
}

function smallestIdFirst(cta, ctb) {
  return -greatestFirst(cta.id, ctb.id);
}

function compareTrips(cta, ctb) {
  return cta && ctb && (
    latestSwitchFirst(cta, ctb) ||
    longestTripFirst(cta, ctb) ||
    smallestIdFirst(cta, ctb)
  ) || wellDefinedFirst(cta, ctb);
}

module.exports = {
  ComparableTrip: ComparableTrip,
  compareTrips: compareTrips
};