// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var defineClass = require('../src/util/define-class');

var MockGeolocation = defineClass({
  publics: {
    getCurrentPosition: function(callback) {
      this.onResolvePosition.add(callback);
    },

    resolvePosition: function(position) {
      this.onResolvePosition(position);
    }
  },

  events: {
    onResolvePosition: 'once'
  }
});

var MockNavigator = defineClass({
  constants: [ 'geolocation' ],

  init: function() {
    this.geolocation = new MockGeolocation();
  }
});

module.exports = MockNavigator;