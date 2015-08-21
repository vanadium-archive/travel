// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var vanadium = require('vanadium');

var defineClass = require('./util/define-class');

var SyncgroupManager = require('./syncgroup-manager');
var InvitationManager = require('./invitation-manager');

var DeferredSbWrapper = require('./sync-util/deferred-sb-wrapper');
var DestinationSync = require('./sync-util/destination-sync');
var MessageSync = require('./sync-util/message-sync');
var TripManager = require('./sync-util/trip-manager');

var vdlTravel = require('../ifc');

var TravelSync = defineClass({
  /* Schema note: although we don't support merging destination list structure
   * changes, we use indirection in the destination list so that we don't have
   * to move multiple keys on random insertion or deletion and can still support
   * parallel destination edits. */
  publics: {
    bindDestinations: function(destinations) {
      this.destinationSync.bindDestinations(destinations);
    },

    message: function(messageContent) {
      this.messageSync.message(messageContent);
    },

    getActiveTripId: function() {
      return this.tripManager.getActiveTripId();
    },

    getActiveTripOwner: function() {
      return this.tripManager.getActiveTripOwner();
    },

    setActiveTripId: function(tripId) {
      this.tripManager.setActiveTripId(tripId);
    },

    getData: function() {
      return this.sbw.getData();
    },

    /**
     * Sets the active trip to the given trip ID after it is available.
     */
    watchForTrip: function(tripId) {
      this.tripManager.watchForTrip(tripId);
    },

    joinTripSyncGroup: function(owner, tripId) {
      return this.tripManager.joinTripSyncGroup(owner, tripId);
    }
  },

  privates: {
    processUpdates: function(data) {
      this.tripManager.processTrips(data.user && data.user.tripMetadata,
        data.trips);

      this.messageSync.processMessages(this.tripManager.getMessageData());
      this.destinationSync.processDestinations(
        this.tripManager.getDestinationData());

      this.tripManager.setUpstream();
    },

    serve: function(args) {
      var self = this;
      var mountNames = args.mountNames;
      var vanadiumWrapper = args.vanadiumWrapper;

      this.status.rpc = 'starting';
      return vanadiumWrapper.server(
          vanadium.naming.join(mountNames.device, 'rpc'), this.server)
        .then(function(server) {
          self.status.rpc = 'ready';
          return server;
        }, function(err) {
          self.status.rpc = 'failed';
          throw err;
        });
    },

    connectSyncbase: function(args) {
      var self = this;
      var vanadiumWrapper = args.vanadiumWrapper;

      this.status.syncbase = 'starting';
      return vanadiumWrapper
        .syncbase(this.syncbaseName)
        .then(function(syncbase) {
          self.status.syncbase = 'ready';
          return syncbase;
        }, function(err) {
          self.status.syncbase = 'failed';
          throw err;
        });
    },

    createSyncgroupManager: function(args, syncbase) {
      var gm = new SyncgroupManager(args.identity, args.vanadiumWrapper,
        syncbase, args.mountNames);
      gm.onError.add(this.onError);

      return gm;
    },

    createPrimarySyncGroup: function(groupManager) {
      var self = this;

      this.status.userSyncGroup = 'creating';
      return groupManager.createSyncGroup('user', [[]])
        .then(function(sg) {
          self.status.userSyncGroup = 'created';
          return sg;
        }, function(err) {
          self.status.usersSyncGroup = 'failed';
          throw err;
        });
    }
  },

  constants: [ 'invitationManager', 'startup', 'status' ],
  events: {
    /**
     * @param newSize
     */
    onTruncateDestinations: '',

    /**
     * @param i
     * @param place
     */
    onPlaceChange: '',

    onError: 'memory',

    /**
     * @param messages array of {content, timestamp} pair objects.
     */
    onMessages: '',

    onStatusUpdate: ''
  },

  /**
   * @param prereqs a promise that produces { identity, mountNames,
   *  vanadiumWrapper }.
   * @mapsDependencies an object with the following keys:
   *  maps
   *  placesService
   * @syncbaseName name of the local SyncBase endpoint.
   */
  init: function(prereqs, mapsDependencies, syncbaseName) {
    var self = this;

    this.syncbaseName = syncbaseName;

    this.tripStatus = {};
    this.status = {};

    this.server = new vdlTravel.TravelSync();
    var startRpc = prereqs.then(this.serve);
    var startSyncbase = prereqs.then(this.connectSyncbase);

    var sbw = this.sbw = new DeferredSbWrapper(startSyncbase);
    sbw.onError.add(this.onError);
    sbw.onUpdate.add(this.processUpdates);

    this.startSyncgroupManager = Promise
      .all([prereqs, startSyncbase])
      .then(function(args) {
        return self.createSyncgroupManager(args[0], args[1]);
      });
    var createPrimarySyncGroup = this.startSyncgroupManager
      .then(this.createPrimarySyncGroup);

    var usernamePromise = prereqs.then(function(args) {
      return args.identity.username;
    });

    this.tripManager = new TripManager(
      usernamePromise, sbw, this.startSyncgroupManager);
    this.messageSync = new MessageSync(sbw, this.tripManager);
    this.destinationSync = new DestinationSync(
      mapsDependencies, sbw, this.tripManager);

    this.messageSync.onMessages.add(this.onMessages);

    this.startup = Promise.all([
        startRpc,
        startSyncbase,
        this.startSyncgroupManager,
        createPrimarySyncGroup
      ]).then(function(values) {
        return {
          server: values[0],
          syncbase: values[1],
          groupManager: values[2]
        };
      });

    this.invitationManager = new InvitationManager(usernamePromise,
      this.startSyncgroupManager);
    this.invitationManager.onError.add(this.onError);
  }
});

module.exports = TravelSync;
