// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var jq = require('jquery');
var window = require('global/window');

var $;
if (window.document) {
  $ = jq;
} else {
  var jsdom = require('jsdom').jsdom;
  window = jsdom().parentWindow;
  $ = jq(window);
}

require('hoverintent-jqplugin')($);

module.exports = $;