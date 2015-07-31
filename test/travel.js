// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var test = require('tape');

var $ = require('../src/util/jquery');
var Travel = require('../src/travel');

var mockMaps = require('../mocks/google-maps');
var mockVanadiumWrapper = require('../mocks/vanadium-wrapper');

function cleanDom() {
  $('body').empty();
}

test('init', function(t) {
  /* jshint -W031 */ //instantiation smoke test
  new Travel({
    maps: mockMaps
  });
  /* jshint +W031 */
  t.end();
  cleanDom();
});

test('domRoot', function(t) {
  var $root = $('<div>');
  var root = $root[0];
  $('body').append($root);

  /* jshint -W031 */ //top-level application
  new Travel({
    maps: mockMaps,
    vanadiumWrapper: mockVanadiumWrapper,
    domRoot: root
  });
  /* jshint +W031 */

  t.ok($root.children().length, 'app parented to given root');

  t.end();
  cleanDom();
});