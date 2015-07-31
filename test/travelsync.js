// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var test = require('tape');

var TravelSync = require('../src/travelsync');

test('init', function(t) {
  t.ok(new TravelSync(), 'initializes');
  t.end();
});