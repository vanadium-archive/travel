// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var vanadium = require('vanadium');

var defineClass = require('./util/define-class');
var naming = require('./naming');

var SyncgroupManager = defineClass({
  publics: {
    createSyncGroup: function(name, prefixes) {
      var self = this;

      return this.prereq.then(function() {
        var sg = self.syncbaseWrapper.syncGroup(self.sgAdmin, name);

        var mgmt = vanadium.naming.join(self.mountNames.app, 'sgmt');
        var spec = sg.buildSpec(prefixes, [mgmt]);

        /* TODO(rosswang): Right now, duplicate Syncbase creates on
         * different Syncbase instances results in siloed SyncGroups.
         * Revisit this logic once it merges properly. */
        return sg.joinOrCreate(spec).then(function() {
          // TODO(rosswang): this is a hack to make the syncgroup joinable
          return self.vanadiumWrapper.setPermissions(mgmt, new Map([
            ['Admin', {in: ['...']}],
            ['Read', {in: ['...']}],
            ['Resolve', {in: ['...']}]
          ]));
        }).then(function() {
          return sg;
        });
      });
    },

    destroySyncGroup: function(name) {
      return this.syncbaseWrapper.syncGroup(this.sgAdmin, name).destroy();
    },

    joinSyncGroup: function(owner, name) {
      var sg = this.syncbaseWrapper.syncGroup(
        vanadium.naming.join(naming.appMount(owner), 'sgadmin'), name);
      return sg.join();
    }
  },

  privates: {
    advertise: function() {
      var self = this;

      var basicPerms = new Map([
        ['Admin', {in: [this.identity.account]}],
        ['Read', {in: ['...']}],
        ['Resolve', {in: ['...']}]
      ]);

      return Promise.all([
        /* TODO(rosswang): this is a very short term hack just because user
         * mount names on ns.dev.v.io don't yet default to Resolve in [...].
         */
        this.vanadiumWrapper.setPermissions(this.mountNames.user, basicPerms),
        this.vanadiumWrapper.setPermissions(this.mountNames.app, basicPerms),
        this.prereq.then(function() {
          // TODO(rosswang): This seems wrong too.
          return self.vanadiumWrapper.setPermissions(self.sgAdmin, basicPerms);
        })
      ]);
    }
  },

  constants: [ 'sgAdmin', 'syncbaseWrapper' ],

  events: {
    onError: 'memory'
  },

  init: function(identity, vanadiumWrapper, syncbaseWrapper, mountNames) {
    this.identity = identity;
    this.vanadiumWrapper = vanadiumWrapper;
    this.syncbaseWrapper = syncbaseWrapper;
    this.mountNames = mountNames;

    this.sgAdmin = vanadium.naming.join(mountNames.app, 'sgadmin');

    /* TODO(rosswang): Once Vanadium supports global SyncGroup admin
     * creation, remove this. For now, use the first local Syncbase
     * instance to administrate. */
    this.prereq = vanadiumWrapper.mount(this.sgAdmin, syncbaseWrapper.mountName,
      vanadiumWrapper.multiMount.FAIL);

    this.advertise().catch(this.onError);
  }
});

module.exports = SyncgroupManager;
