// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var Deferred = require('vanadium/src/lib/deferred');
var defineClass = require('../src/util/define-class');
var $ = require('../src/util/jquery');

var MockWrapper = defineClass({
  publics: {
    getAccountName: function() {
      return this.accountName;
    },

    server: function(endpoint, server) {
      return this.endpointResolver(endpoint, server);
    },

    syncbase: function(endpoint) {
      return this.server(endpoint);
    },

    setPermissions: function() {
      return Promise.resolve();
    }
  },

  events: {
    onCrash: 'public',
    onError: 'public'
  },

  /**
   * @param provider callback that receives the endpoint name and possibly a
   *  Vanadium server implementation, and returns a promise to a mock service.
   *  This callback is called once per server or syncbase call.
   */
  init: function(props, endpointResolver) {
    $.extend(this, props);
    this.endpointResolver = endpointResolver;
  }
});

module.exports = {
  init: function() {
    return new Deferred().promise;
  },

  newInstance: function() {
    var wrapper;
    var init = new Deferred();

    return {
      finishInit: function(props, endpointResolver) {
        wrapper = new MockWrapper(props, endpointResolver);
        init.resolve(wrapper);
      },

      init: function() {
        return init.promise;
      }
    };
  }
};