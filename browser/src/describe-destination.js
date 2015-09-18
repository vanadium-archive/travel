// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var strings = require('./strings').currentLocale;
var DestinationMarker = require('./components/destination-marker');

var ORIGIN = 0;
var INTERMEDIATE = 1;
var TERMINAL = 2;
var TERMINAL_DIRECT = 3;

function classify(destination) {
  if (!destination.hasPrevious()) {
    return ORIGIN;
  } else if (!destination.hasNext()) {
    return destination.getIndex() === 1? TERMINAL_DIRECT : TERMINAL;
  } else {
    return INTERMEDIATE;
  }
}

function description(destination) {
  switch (classify(destination)) {
    case ORIGIN:
      return strings['Origin'];
    case INTERMEDIATE:
      return strings.destination(destination.getIndex());
    case TERMINAL:
      return strings['Final destination'];
    case TERMINAL_DIRECT:
      return strings['Destination'];
  }
}

function descriptionOpenEnded(destination) {
  switch (classify(destination)) {
    case ORIGIN:
      return strings['Origin'];
    case TERMINAL:
    case INTERMEDIATE:
      return strings.destination(destination.getIndex());
    case TERMINAL_DIRECT:
      return strings['Destination'];
  }
}

function decorateMarker(marker, destination) {
  switch (classify(destination)) {
    case ORIGIN:
      marker.setIcon(DestinationMarker.icon.ORIGIN);
      break;
    case INTERMEDIATE:
      marker.setLabel(destination.getIndex());
      break;
    case TERMINAL:
    case TERMINAL_DIRECT:
      marker.setIcon(DestinationMarker.icon.DESTINATION);
      break;
  }
  marker.setDestinationLabel(description(destination));
}

module.exports = {
  description: description,
  descriptionOpenEnded: descriptionOpenEnded,
  decorateMarker: decorateMarker
};
