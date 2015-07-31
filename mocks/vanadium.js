// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var defineClass = require('../src/util/define-class');
var Deferred = require('vanadium/src/lib/deferred');

var MockRuntime = defineClass({
  publics: {
    on: function(event, handler) {
      if (event === 'crash') {
        this.onCrash.add(handler);
      }
    },
    fireCrash: function(err) {
      this.onCrash(err);
    }
  },

  events: {
    onCrash: 'private'
  }
});

var MockVanadium = defineClass({
  init: function(t) {
    this.t = t;
  },

  publics: {
    init: function(config, callback) {
      this.t.ok(config, 'has config');
      this.deferred = new Deferred(callback);
      return this.deferred.promise;
    },

    finishInit: function(err, runtime) {
      if (err) {
        this.deferred.reject(err);
      } else {
        this.deferred.resolve(runtime);
      }
    }
  },

  statics: {
    vlog: {
      levels: {
        INFO: 'info'
      }
    }
  }
});

module.exports = {
  MockRuntime: MockRuntime,
  MockVanadium: MockVanadium
};