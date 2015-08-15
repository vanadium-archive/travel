// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var $ = require('./util/jquery');
var defineClass = require('./util/define-class');
var debug = require('./debug');

// TODO(rosswang): generalize this
var ESC = {
  '_': '_',
  '.': 'd',
  '@': 'a'
};

var INV = {};
$.each(ESC, function(k, v) {
  INV[v] = k;
});

function escapeUsername(str) {
  return str.replace(/_|\.|@/g, function(m) {
    return '_' + ESC[m];
  });
}

function unescapeUsername(str) {
  return str.replace(/_(.)/g, function(m, p1) {
    return INV[p1];
  });
}

function invitationKey(recipient, owner, tripId) {
  return [
    'invitations',
    escapeUsername(recipient),
    escapeUsername(owner),
    tripId
  ];
}

var InvitationManager = defineClass({
  publics: {
    invite: function(recipient, owner, tripId) {
      var self = this;

      return this.groupManagerPromise.then(function(gm) {
        return gm.joinSyncGroup(recipient, 'invitations').then(function() {
          return gm.syncbaseWrapper.put(invitationKey(recipient, owner, tripId),
            self.username);
        });
      });
    },

    getUsername: function() {
      return this.username;
    }
  },

  privates: {
    invitation: defineClass.innerClass({
      publics: {
        delete: function() {
          var self = this;

          var username = this.outer.username;
          return this.outer.syncbasePromise.then(function(syncbase) {
            return syncbase.delete(invitationKey(
              username, self.owner, self.tripId));
          });
        }
      },

      constants: [ 'owner', 'tripId', 'sender' ],

      events: {
        onDismiss: 'memory once'
      },

      init: function(owner, tripId, sender, callbacks) {
        this.owner = owner;
        this.tripId = tripId;
        this.sender = sender;
        callbacks.dismiss = this.onDismiss;
      }
    }),

    processUpdates: function(data) {
      var self = this;

      var toMe;
      if (data.invitations &&
          (toMe = data.invitations[escapeUsername(this.username)])) {
        $.each(toMe, function(owner, ownerRecords) {
          var ownerInvites = self.invitations[owner];
          if (!ownerInvites) {
            ownerInvites = self.invitations[owner] = {};
          }

          var uOwner;

          $.each(ownerRecords, function(tripId, sender) {
            var record = ownerInvites[tripId];
            if (record) {
              record.seen = true;
            } else {
              if (!uOwner) {
                uOwner = unescapeUsername(owner);
              }

              debug.log('Received invite from ' + sender + ' to ' + uOwner +
                ':' + tripId);

              var callbacks = {};
              var invite = self.invitation(uOwner, tripId, sender, callbacks);
              ownerInvites[tripId] = {
                invite: invite,
                dismiss: callbacks.dismiss,
                seen: true
              };
              self.onInvite(invite);
            }
          });
        });
      }

      if (this.invitations) {
        $.each(this.invitations, function(owner, ownerRecords) {
          $.each(ownerRecords, function(tripId, record) {
            if (record.seen) {
              delete record.seen;
            } else {
              delete ownerRecords[tripId];
              record.dismiss();
            }
          });
        });
      }
    }
  },

  events: {
    /**
     * @param invitation
     */
    onInvite: '',

    onError: 'memory'
  },

  /**
   * @param prereqs promise of { identity, mountNames, vanadiumWrapper }
   */
  init: function(prereqs, groupManagerPromise) {
    var self = this;

    this.prereqs = prereqs;
    this.syncbasePromise = groupManagerPromise.then(function(gm) {
      gm.syncbaseWrapper.onUpdate.add(self.processUpdates);
      return gm.syncbaseWrapper;
    });
    this.groupManagerPromise = groupManagerPromise;

    this.invitations = {};

    prereqs.then(function(args) {
      //this will have been set prior to groupManagerPromise completing
      self.username = args.identity.username;
    });

    groupManagerPromise.then(function(gm) {
      gm.createSyncGroup('invitations',
          [['invitations', escapeUsername(self.username)]])
        .catch(self.onError);
    });
  }
});

module.exports = InvitationManager;