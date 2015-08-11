// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var test = require('tape');

var Identity = require('../src/identity');

function verifyAutoAccount(t, i) {
  t.equals(i.account, '...', 'unknown account defaults to open');
  t.assert(i.username.length > 1, 'auto-generated username is nontrivial');
}

test('auto-generated username from unknown', function(t) {
  var a = new Identity('unknown'),
      b = new Identity('unknown');
  verifyAutoAccount(t, a);
  verifyAutoAccount(t, b);
  t.notEqual(b.username, a.username, 'auto-generated username is unique');
  t.end();
});

function testAutoExtract(t, r) {
  var i = new Identity(r);
  verifyAutoAccount(t, i);
  t.not(i.username, r);
  t.end();
}

test('extract username from undefined', function(t) {
  testAutoExtract(t);
});

test('extract username from null', function(t) {
  testAutoExtract(t, null);
});

test('extract username from "false"', function(t) {
  t.equals(new Identity('false').username, 'false',
    '"false" string literal should pass as a username');
  t.end();
});

var testAccountName = 'dev.v.io/u/joeuser@google.com/chrome';

test('init', function(t) {
  var i = new Identity(testAccountName);
  t.equals(i.account, 'dev.v.io/u/joeuser@google.com',
    'should generalize a dev.v.io account name');
  t.equals(i.username, 'joeuser@google.com',
    'should extract a username from a dev.v.io account name');
  var expectedPrefix = 'joeuser@google.com/desktop_';
  t.assert(i.entityName.slice(0, expectedPrefix.length) === expectedPrefix,
    'entityName starts with expected prefix');
  t.assert(i.entityName.length > expectedPrefix.length,
    'entityName is longer than expected prefix');
  t.end();
});