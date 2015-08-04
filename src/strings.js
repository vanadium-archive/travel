// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

function getStrings(locale) {
  return {
    'Add destination': 'Add destination',
    add: function(object) {
      return 'Add ' + object.toLowerCase();
    },
    change: function(object) {
      return 'Change ' + object.toLowerCase();
    },
    'Connected to all services.': 'Connected to all services.',
    'Connecting...': 'Connecting...',
    'Destination': 'Destination',
    destination: function(n) {
      return 'Destination ' + n;
    },
    DirectionsStatus: {
      NOT_FOUND: 'Location not found',
      ZERO_RESULTS: 'No route to destination',
      MAX_WAYPOINTS_EXCEEDED: 'Maximum number of waypoints exceeded',
      OVER_QUERY_LIMIT: 'Request rate exceeded',
      REQUEST_DENIED: 'Request denied',
      UNKNOWN_ERROR: 'Server error'
    },
    'Final destination': 'Final destination',
    label: function(label, details) {
      return label + ': ' + details;
    },
    'Origin': 'Origin',
    'Search': 'Search',
    'Timeline': 'Timeline',
    'Travel Planner': 'Travel Planner',
    'Unknown error': 'Unknown error'
  };
}

getStrings.currentLocale = getStrings();

module.exports = getStrings;