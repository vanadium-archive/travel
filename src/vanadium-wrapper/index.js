// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var vanadiumDefault = require('vanadium');
var defineClass = require('../util/define-class');

var SyncbaseWrapper = require('./syncbase-wrapper');

//ms
var NAME_TTL = 5000;
var NAME_REFRESH = 2500;

var VanadiumWrapper = defineClass({
  statics: {
    multiMount: {
      ADD: 0,
      REPLACE: 1,
      /**
       * TODO(rosswang): This mode is not perfect/not entirely supported and is
       * a hack to allow somewhat deterministic syncbase admin mounting before
       * mount tables can spin up their own instances.
       */
      FAIL: 2
    }
  },

  publics: {
    getAccountName: function() {
      return this.runtime.accountName;
    },

    mount: function(name, server, multiMount) {
      var self = this;

      multiMount = multiMount || this.multiMount.ADD;

      function refreshName() {
        var p;

        var context = self.runtime.getContext();
        var namespace = self.runtime.namespace();

        function mount(replaceMount) {
          return namespace.mount(context, name, server, NAME_TTL, replaceMount);
        }

        if (multiMount === self.multiMount.FAIL) {
          /* TODO(rosswang): of course this isn't perfect; this is a hack to be
           * removed once we no longer need to mount an admin syncbase
           * instance. */


          p = namespace.resolve(context, name)
            .then(function(addresses) {
              if (addresses[0] === server) {
                return mount(true);
              }
            }, function(err) {
              // TODO(rosswang): does this work?
              if (err instanceof vanadiumDefault.naming.ErrNoSuchName) {
                return mount(true);
              } else {
                throw err;
              }
            });
        } else {
          p = mount(multiMount === self.multiMount.REPLACE);
        }

        p.catch(self.onError);

        /* TODO(rosswang): should refresh intervals start here after initiation
         * or after ack? */
        setTimeout(refreshName, NAME_REFRESH);

        return p;
      }
      return refreshName();
    },

    getPermissions: function(name) {
      return this.runtime.namespace().getPermissions(
        this.runtime.getContext(), name);
    },

    setPermissions: function(name, perms) {
      return this.runtime.namespace().setPermissions(
        this.runtime.getContext(), name, perms);
    },

    context: function() {
      return this.runtime.getContext();
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
    },

    /**
     * @param endpoint Vanadium name
     */
    syncbase: function(endpoint) {
      return SyncbaseWrapper.start(this.runtime.getContext(), endpoint);
    }
  },

  events: {
    onCrash: 'memory',
    onError: 'memory'
  },

  init: function(runtime) {
    this.runtime = runtime;
    runtime.on('crash', this.onCrash);
  }
});

module.exports = {
  multiMount: VanadiumWrapper.multiMount,

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

    return vanadium.init(config).then(function(runtime) {
      return new VanadiumWrapper(runtime);
    });
  }
};
