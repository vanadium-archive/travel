// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

/**
 * Given a Maps API address_components array, return an array of formatted
 * address lines. This code is highly fragile and heaven help the poor soul who
 * needs to localize it.
 *
 * TODO(rosswang): Is this really the best way? We should find a formatter.
 */
function formatAddress(details) {
  //some maps API members are lower_underscore
  /* jshint camelcase: false */
  var addr = details && details.formatted_address;
  /* jshint camelcase: true */
  if (!addr) {
    return [];
  }

  /* If at any point the first line/atom will echo the place name/search query,
   * leave it out, as it will be the title of the info box anyway. */

  var parts = addr.split(', ');
  var lines = (function() {
    switch (parts.length) {
      case 2:
        // ex. WA, USA => WA, USA
        return [parts.join(', ')];
      case 3:
        // ex. Seattle, WA, USA => Seattle, WA || WA, USA
        // (if Seattle was the search query, format as if it were WA, USA)
        return parts[0] === details.name?
          [parts[1] + ', ' + parts[2]] : [parts[0] + ', ' + parts[1]];
      case 4: {
        /* ex. Amphitheatre Pkwy, Mountain View, CA 94043, USA:
         *
         * Amphitheatre Pkwy
         * Mountain View, CA 94043
         */
        return [parts[0], parts[1] + ', ' + parts[2]];
      }
      case 5: {
        /* ex. Fort Mason, 2 Marina Blvd, San Francisco, CA 94123, USA
         *
         * Fort Mason
         * 2 Marina Blvd
         * San Francisco, CA 94123
         */
        return [parts[0], parts[1], parts[2] + ', ' + parts[3]];
      }
      case 6: {
        /* ex. A, Fort Mason, 2 Marina Blvd, San Francisco, CA 94123, USA
         *
         * A, Fort Mason
         * 2 Marina Blvd
         * San Francisco, CA 94123
         */
        return [
          parts[0] + ', ' + parts[1],
          parts[2],
          parts[3] + ', ' + parts[4]
        ];
      }
      default:
        return parts;
    }
  })();

  return lines[0] === details.name? lines.slice(1) : lines;
}

function render(details) {
  var $info = $('<div>').addClass('destination-info');

  if (details && details.name) {
    $info.append($('<div>')
      .addClass('title')
      .text(details.name));
  }

  var addressLines = formatAddress(details);
  if (addressLines) {
    $.each(addressLines,
      function(i, line) {
        $info.append($('<div>')
          .addClass('address-line')
          .text(line));
      });
  }

  return $info[0];
}

var DestinationInfo = defineClass({
  publics: {
    close: function() {
      this.infoWindow.close();
    },

    show: function(marker) {
      this.infoWindow.open(this.map, marker);
    },

    setDetails: function(details) {
      this.infoWindow.setContent(render(details));
      this.infoWindow.setPosition(details && details.geometry.location);
    }
  },

  init: function(maps, map, details) {
    this.map = map;

    this.infoWindow = new maps.InfoWindow({
      content: render(details),
      position: details && details.geometry.location
    });
  }
});

module.exports = DestinationInfo;
