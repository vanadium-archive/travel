// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var vanadium = require('vanadium');

var defineClass = require('./util/define-class');
var Identity = require('./identity');
var naming = require('./naming');

var SyncgroupManager = defineClass({
  publics: {
    createSyncGroup: function(name, prefixes, initialCollaborators) {
      var self = this;

      var sg = this.syncbaseWrapper.syncGroup(self.sgAdmin, name);

      var mgmt = vanadium.naming.join(this.mountNames.app, 'sgmt');
      var spec = sg.buildSpec(prefixes, [mgmt], this.identity.account,
        initialCollaborators.map(function(username) {
          return username === '...'?
            username : Identity.blessingForUsername(username);
        }));

      return sg.joinOrCreate(spec).then(function() {
        // TODO(rosswang): this is a hack to make the SyncGroup joinable
        return self.vanadiumWrapper.setPermissions(mgmt, new Map([
          ['Admin', {in: ['...']}],
          ['Read', {in: ['...']}],
          ['Resolve', {in: ['...']}]
        ]));
      }).then(function() {
        return sg;
      });
    },

    destroySyncGroup: function(name) {
      return this.syncbaseWrapper.syncGroup(this.sgAdmin, name).destroy();
    },

    joinSyncGroup: function(owner, name) {
      return this.getForeignSyncGroup(owner, name).join();
    },

    addCollaborator: function(owner, sgName, username) {
      var blessing = Identity.blessingForUsername(username);
      return this.getForeignSyncGroup(owner, sgName)
        .changeSpec(function(spec) {
          ['Read', 'Write', 'Resolve'].forEach(function(perm) {
            spec.perms.get(perm).in.push(blessing);
          });
        });
    }
  },

  privates: {
    getForeignSyncGroup: function(owner, name) {
      return this.syncbaseWrapper.syncGroup(
        vanadium.naming.join(naming.appMount(owner), 'sgadmin'), name);
    },

    advertise: function() {
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
        this.vanadiumWrapper.setPermissions(this.mountNames.app, basicPerms)
      ]);
    }
  },

  constants: [ 'identity', 'sgAdmin', 'syncbaseWrapper' ],

  events: {
    onError: 'memory'
  },

  init: function(identity, vanadiumWrapper, syncbaseWrapper, mountNames) {
    this.identity = identity;
    this.vanadiumWrapper = vanadiumWrapper;
    this.syncbaseWrapper = syncbaseWrapper;
    this.mountNames = mountNames;

    this.sgAdmin = vanadium.naming.join(mountNames.app, 'sgadmin');

    this.advertise().catch(this.onError);
  }
});

module.exports = SyncgroupManager;
