// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var DestinationSync = require('./destination-sync');

/* This mini-module used to simply be a static function in TripManager, but it
 * was also needed by a dependency of TripManager, tripComparator. The cyclic
 * dependency caused loading issues. */

module.exports = function(trip) {
  return trip.destinations?
    DestinationSync.getDestinationIds(trip.destinations).length : 0;
};
