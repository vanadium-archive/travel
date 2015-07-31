// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var test = require('tape');

var $ = require('../../src/util/jquery');

var Map = require('../../src/components/map');
var message = require ('../../src/components/message');

var mockMaps = require('../../mocks/google-maps');

test('message display', function(t) {
  var map = new Map({
    maps: mockMaps
  });

  var $messages = $('.messages ul', map.$);
  t.ok($messages.length, 'message display exists');
  t.equals($messages.children().length, 0, 'message display is empty');

  map.message(message.info('Test message.'));

  var $messageItem = $messages.children();
  t.equals($messageItem.length, 1, 'message display shows 1 message');
  t.equals($messageItem.text(), 'Test message.',
    'message displays message text');

  t.end();
});
