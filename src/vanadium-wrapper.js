// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('./util/jquery');

var vanadiumDefault = require('vanadium');
var defineClass = require('./util/define-class');

var VanadiumWrapper = defineClass({
  init: function(runtime) {
    this.runtime = runtime;
    runtime.on('crash', this.onCrash);
  },

  publics: {
    getAccountName: function() {
      return this.runtime.accountName;
    },

    /**
     * @param endpoint Vanadium name
     * @returns a promise resolving to a client or rejecting with an error.
     */
    client: function(endpoint) {
      var client = this.runtime.newClient();
      return client.bindTo(this.runtime.getContext(), endpoint);
    },

    /**
     * @param endpoint Vanadium name
     * @param server object implementing server APIs
     * @returns a promise resolving to void or rejecting with an error.
     */
    server: function(endpoint, server) {
      return this.runtime.newServer().serve(endpoint, server);
    }
  },

  events: {
    onCrash: 'memory'
  }
});

module.exports = {
  /**
   * @param vanadium optional vanadium override
   * @returns a promise resolving to a VanadiumWrapper or rejecting with an
   *  error.
   */
  init: function(vanadium) {
    vanadium = vanadium || vanadiumDefault;

    var config = {
      logLevel: vanadium.vlog.levels.INFO,
      appName: 'Travel Planner'
    };

    var async = $.Deferred();

    vanadium.init(config, function(err, runtime) {
      if (err) {
        async.reject(err);
      } else {
        async.resolve(new VanadiumWrapper(runtime));
      }
    });

    return async.promise();
  }
};
