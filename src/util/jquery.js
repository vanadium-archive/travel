// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var jq = require('jquery');
var window = require('global/window');

if (window.document) {
  module.exports = jq;
} else {
  var jsdom = require('jsdom').jsdom;
  window = jsdom().parentWindow;
  module.exports = jq(window);
}