// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var verror = require('vanadium').verror;

var $ = require('./util/jquery');
var defineClass = require('./util/define-class');
var debug = require('./debug');

var SyncbaseWrapper = require('./vanadium-wrapper/syncbase-wrapper');

function invitationKey(recipient, owner, tripId) {
  return [
    'invitations',
    SyncbaseWrapper.escapeKeyElement(recipient),
    SyncbaseWrapper.escapeKeyElement(owner),
    tripId
  ];
}

function tripSgName(tripId) {
  return 'trip-' + tripId;
}

var InvitationManager = defineClass({
  publics: {
    invite: function(recipient, owner, tripId) {
      var self = this;

      return this.sgmPromise.then(function(sgm) {
        return Promise.all([
            self.addTripCollaborator(owner, tripId, recipient),
            sgm.joinSyncGroup(recipient, 'invitations')
          ]).then(function() {
            return sgm.syncbaseWrapper.put(
              invitationKey(recipient, owner, tripId), self.username);
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
        accept: function() {
          return this.outer.joinTripSyncGroup(this.owner, this.tripId)
            .then(this.delete);
        },

        decline: function() {
          return this.delete();
        }
      },

      privates: {
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

    createTripSyncGroup: function(tripId, initialCollaborators) {
      return this.sgmPromise.then(function(sgm) {
        return sgm.createSyncGroup(tripSgName(tripId), [['trips', tripId]],
          [sgm.identity.username].concat(initialCollaborators));
      });
    },

    joinTripSyncGroup: function(owner, tripId) {
      return this.sgmPromise.then(function(sgm) {
        return sgm.joinSyncGroup(owner, tripSgName(tripId));
      });
    },

    addTripCollaborator: function(owner, tripId, collaborator) {
      var self = this;

      return this.sgmPromise.then(function(sgm) {
        return sgm.addCollaborator(owner, tripSgName(tripId), collaborator)
          .catch(function(err) {
            if (err instanceof verror.NoExistError &&
                owner === self.username) {
              return self.createTripSyncGroup(tripId, collaborator);
            } else {
              throw err;
            }
          });
      });
    },

    manageTripSyncGroups: function(trips) {
      var self = this;

      //TODO(rosswang): maybe make this more intelligent, and handle ejection
      if (trips) {
        $.each(trips, function(tripId, trip) {
          if (trip.owner) {
            self.joinTripSyncGroup(trip.owner, tripId)
              .catch(function(err) {
                if (!(err instanceof verror.NoExistError)) {
                  throw err;
                }
              }).catch(self.onError);
          }
        });
      }
    },

    processUpdates: function(data) {
      var self = this;

      this.manageTripSyncGroups(data.trips);

      var toMe = data.invitations &&
        data.invitations[SyncbaseWrapper.escapeKeyElement(this.username)];
      if (toMe) {
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
                uOwner = SyncbaseWrapper.unescapeKeyElement(owner);
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

  init: function(sgmPromise) {
    var self = this;

    this.syncbasePromise = sgmPromise.then(function(sgm) {
      self.username = sgm.identity.username;
      sgm.syncbaseWrapper.onUpdate.add(self.processUpdates);
      return sgm.syncbaseWrapper;
    });
    this.sgmPromise = sgmPromise;

    this.invitations = {};

    sgmPromise.then(function(sgm) {
      sgm.createSyncGroup('invitations',
          [['invitations', SyncbaseWrapper.escapeKeyElement(self.username)]],
          ['...'])
        .catch(self.onError);
    });
  }
});

module.exports = InvitationManager;