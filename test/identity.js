'use strict';

var test = require('tape');

var Identity = require('../src/identity');

function verifyAutoAccountName(t, n) {
  t.assert(n.length > 1, 'auto-generated username is nontrivial');
}

test('auto-generated username from unknown', function(t) {
  var a = new Identity('unknown').username,
      b = new Identity('unknown').username;
  verifyAutoAccountName(t, a);
  verifyAutoAccountName(t, b);
  t.notEqual(b, a, 'auto-generated username is unique');
  t.end();
});

function testAutoExtract(t, r) {
  var n = new Identity(r).username;
  verifyAutoAccountName(t, n);
  t.not(n, r);
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
  t.equals(i.username, 'joeuser@google.com',
    'should extract a username from a dev.v.io account name');
  var expectedPrefix = 'joeuser@google.com/desktop_';
  t.assert(i.entityName.slice(0, expectedPrefix.length) == expectedPrefix,
    'entityName starts with expected prefix');
  t.assert(i.entityName.length > expectedPrefix.length,
    'entityName is longer than expected prefix');
  t.end();
});