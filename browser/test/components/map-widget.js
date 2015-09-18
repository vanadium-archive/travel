// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var test = require('tape');

var MapWidget = require('../../src/components/map-widget');
var mockMaps = require('../../mocks/google-maps');

test('instantiation', function(t) {
  t.doesNotThrow(function() {
    //instantiation smoke test
    /* jshint -W031 */
    new MapWidget({
      maps: mockMaps
    });
    /* jshint +W031 */
  });

  t.end();
});
