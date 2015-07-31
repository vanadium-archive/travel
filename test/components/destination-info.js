// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var test = require('tape');
var $ = require('../../src/util/jquery');

var DestinationInfo = require('../../src/components/destination-info');
var mockMaps = require('../../mocks/google-maps');

function setUpWithCanvas() {
  var map = new mockMaps.Map($('<div>')[0]);
  var info = new DestinationInfo(mockMaps, map,
    mockMaps.places.mockPlaceResult);
  return {
    map: map,
    info: info
  };
}

test('lifecycle', function(t) {
  var tc = setUpWithCanvas();
  tc.info.show();
  t.ok(tc.map.hasInfoWindow(), 'infoWindow opened');
  tc.info.close();
  t.notOk(tc.map.hasInfoWindow(), 'infoWindow closed');
  t.end();
});
