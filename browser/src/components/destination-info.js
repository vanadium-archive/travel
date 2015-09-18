// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

function render(place) {
  var $info = $('<div>').addClass('destination-info');

  if (place) {
    var details = place.getDetails();
    if (details && details.name) {
      $info.append($('<div>')
        .addClass('title')
        .text(details.name));
    }

    $.each(place.getMultiLine(),
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

    setPlace: function(place) {
      this.infoWindow.setContent(render(place));
      this.infoWindow.setPosition(place && place.getLocation());
    }
  },

  init: function(maps, map, place) {
    this.map = map;

    this.infoWindow = new maps.InfoWindow({
      content: render(place),
      position: place && place.getLocation()
    });
  }
});

module.exports = DestinationInfo;
