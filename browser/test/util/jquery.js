// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var test = require('tape');

var jquery = require('../../src/util/jquery');

test('load on server', function(t) {
  t.ok(jquery.each, 'jquery has an each function');
  t.end();
});
