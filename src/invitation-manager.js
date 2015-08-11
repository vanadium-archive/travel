// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var $ = require('./util/jquery');
var defineClass = require('./util/define-class');

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

function invitationKey(owner, recipient) {
  return ['invitations', escapeUsername(owner), escapeUsername(recipient)];
}

var InvitationManager = defineClass({
  publics: {
    accept: function(owner) {
    },

    decline: function(owner) {
      return Promise.all([
        this.syncbasePromise,
        this.prereqs
      ]).then(function(args) {
        var syncbase = args[0];
        var username = args[1].identity.username;

        return syncbase.delete(invitationKey(owner, username));
      });
    },

    getActiveInvite: function() {
      return this.activeInvite;
    },

    invite: function(username) {
      var self = this;

      return this.groupManagerPromise.then(function(gm) {
        return gm.joinSyncGroup(username, 'invitations').then(function() {
          return self.prereqs;
        }).then(function(prereqs) {
          var owner = self.activeInvite || prereqs.identity.username;

          return gm.syncbaseWrapper.put(invitationKey(owner, username),
            prereqs.identity.username);
        });
      });
    },

    getUsername: function() {
      return this.username;
    }
  },

  privates: {
    processUpdates: function(data) {
      var self = this;

      if (data.invitations) {
        $.each(data.invitations, function(owner, record) {
          var ownerInvites = self.invitations[owner];
          if (!ownerInvites) {
            ownerInvites = self.invitations[owner] = {};
          }

          $.each(record, function(recipient, sender) {
            if (ownerInvites[recipient]) {
              delete ownerInvites[recipient];
            } else {
              self.onInvite(unescapeUsername(owner),
                unescapeUsername(recipient), sender);
            }
          });
        });
      }

      if (this.invitations) {
        $.each(this.invitations, function(owner, record) {
          $.each(record, function(recipient, sender) {
            self.onDismiss(unescapeUsername(owner),
              unescapeUsername(recipient), sender);
          });
        });
      }

      this.invitations = data.invitations || {};
    }
  },

  events: {
    /**
     * @param owner the user who owns the trip.
     * @param recipient the user invited to the trip.
     * @param sender the user who sent the invitation.
     */
    onInvite: '',

    /**
     * @param owner the user who owns the trip.
     * @param recipient the user invited to the trip.
     * @param sender the user who sent the invitation.
     */
    onDismiss: '',

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
      self.username = args.identity.username;
    });

    groupManagerPromise.then(function(gm) {
      gm.createSyncGroup('invitations', ['invitations'])
        .catch(self.onError);
    });
  }
});

module.exports = InvitationManager;