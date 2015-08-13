// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var test = require('tape');

var Map = require('../../src/components/map');
var mockMaps = require('../../mocks/google-maps');

test('instantiation', function(t) {
  t.doesNotThrow(function() {
    //instantiation smoke test
    /* jshint -W031 */
    new Map({
      maps: mockMaps
    });
    /* jshint +W031 */
  });

  t.end();
});
