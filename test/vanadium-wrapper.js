// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var test = require('tape');

var vanadiumWrapper = require('../src/vanadium-wrapper');

var vanadiumMocks = require('../mocks/vanadium');
var MockVanadium = vanadiumMocks.MockVanadium;
var MockRuntime = vanadiumMocks.MockRuntime;

function setUpCrashTest(t) {
  var mockVanadium = new MockVanadium(t);
  var mockRuntime = new MockRuntime();

  var context = {
    bindCrashHandler: function(err) {
      var self = this;
      self.vanadiumWrapper.onCrash.add(function(err) {
        self.crashErr = err;
      });
    },
    crash: function(err) {
      mockRuntime.fireCrash(err);
    }
  };

  var promise = vanadiumWrapper.init(mockVanadium).then(
    function(v) {
      context.vanadiumWrapper = v;
      return context;
    },
    function(err) {
      t.fail('init error');
    });

  mockVanadium.finishInit(null, mockRuntime);

  return promise;
}

test('crashBefore', function(t) {
  setUpCrashTest(t).then(function(crashTest) {
    crashTest.crash('I lost the game.');
    crashTest.bindCrashHandler();
    t.equal(crashTest.crashErr, 'I lost the game.');

    t.end();
  });
});

test('crashAfter', function(t) {
  setUpCrashTest(t).then(function(crashTest) {
    crashTest.bindCrashHandler();
    t.notOk(crashTest.crashErr, 'no crash yet');

    crashTest.crash('I lost the game.');
    t.equal(crashTest.crashErr, 'I lost the game.');

    t.end();
  });
});