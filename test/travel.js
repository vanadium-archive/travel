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

test('messages', function(t) {
  var travel = new Travel({
    maps: mockMaps,
    vanadiumWrapper: mockVanadiumWrapper
  });

  var $messages = $('.messages ul');
  t.ok($messages.length, 'message display exists');
  var $messageItems = $messages.children();
  t.equals($messageItems.length, 1,
    'message display has initial status message');

  travel.info('Test message.');

  $messageItems = $messages.children();
  t.equals($messageItems.length, 2, 'message display shows 2 messages');
  t.equals($($messageItems[1]).text(), 'Test message.',
    'message displays message text');
  t.end();
});