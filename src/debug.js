// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('./util/jquery');

/**
 * Global variable exports for console debug.
 */
function debug(app) {
  global.travel = app;
  global.$ = $;
}

debug.log = console.debug? console.debug.bind(console) : $.noop;

module.exports = debug;
