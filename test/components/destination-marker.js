// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var test = require('tape');
var $ = require('../../src/util/jquery');

var DestinationMarker = require('../../src/components/destination-marker');
var Place = require('../../src/place');
var mockMaps = require('../../mocks/google-maps');

function mockMarker(client, color) {
  var map = new mockMaps.Map($('<div>')[0]);
  return new DestinationMarker(mockMaps, map,
    new Place(mockMaps.places.mockPlaceResult), client, color);
}

test('client events', function(t) {
  var CLIENT1 = {};
  var CLIENT2 = {};
  var counts = [];
  var h = [];

  function makeHandler(i) {
    return function() {
      counts[i]++;
    };
  }

  for (var i = 0; i < 6; i++) {
    counts.push(0);
    h.push(makeHandler(i));
  }

  var marker = mockMarker(CLIENT1, DestinationMarker.color.RED);

  marker.onClick.add(h[0]);
  marker.onClick.add([ h[1], h[2] ]);
  marker.onClick.add(h[3]);
  marker.pushClient(CLIENT2);
  marker.onClick.add(h[4]);
  marker.pushClient(CLIENT1);
  marker.onClick.add(h[5]);

  marker.marker.click();
  t.deepEqual(counts, [1, 1, 1, 1, 1, 1], 'all handlers triggered');
  marker.removeClient(CLIENT1);
  marker.onClick.remove([ h[1], h[2] ]);
  marker.marker.click();
  t.deepEqual(counts, [1, 1, 1, 1, 2, 1], 'event handlers for CLIENT1 removed');

  t.end();
});

test('colors', function(t) {
  var marker = mockMarker('c1', DestinationMarker.color.RED);
  var redIcon = marker.marker.getIcon();

  marker.pushClient('c2', DestinationMarker.color.ORANGE);
  var orangeIcon = marker.marker.getIcon();
  t.notEqual(redIcon, orangeIcon, 'color changed with new client');
  marker.setColor(DestinationMarker.color.YELLOW);
  var yellowIcon = marker.marker.getIcon();
  t.notEqual(orangeIcon, yellowIcon, 'color changed via setColor');

  marker.pushClient('c3', DestinationMarker.color.GREEN);
  var greenIcon = marker.marker.getIcon();
  t.notEqual(yellowIcon, greenIcon,
    'color changed with new client after setColor');
  marker.setColor(DestinationMarker.color.BLUE);
  var blueIcon = marker.marker.getIcon();

  marker.removeClient('c2');
  t.equal(marker.marker.getIcon(), blueIcon,
    'color not changed with earlier client removed');

  marker.pushClient('c4', DestinationMarker.color.PURPLE);
  var purpleIcon = marker.marker.getIcon();
  t.notEqual(blueIcon, purpleIcon,
    'color changed with new client after earlier removal');

  marker.removeClient('c4');
  t.equal(marker.marker.getIcon(), blueIcon,
    'color restored after client removal');

  marker.removeClient('c3');
  t.equal(marker.marker.getIcon(), redIcon,
    'color restored to original after client removal with earlier removal of ' +
    'intermediate client');

  t.ok(marker.marker.getMap(), 'marker still attached to map');

  marker.removeClient('c1');
  t.notOk(marker.marker.getMap(), 'marker detached from map');

  t.end();
});
