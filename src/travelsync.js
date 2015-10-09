// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var vanadium = require('vanadium');

var defineClass = require('./util/define-class');

var debug = require('./debug');
var naming = require('./naming');

var SyncgroupManager = require('./syncgroup-manager');
var InvitationManager = require('./invitation-manager');

var DeferredSbWrapper = require('./sync-util/deferred-sb-wrapper');
var DestinationSync = require('./sync-util/destination-sync');
var DeviceSync = require('./sync-util/device-sync');
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

    joinTripSyncgroup: function(owner, tripId) {
      return this.tripManager.joinTripSyncgroup(owner, tripId);
    },

    getRelatedDevices: function(direction) {
      return this.deviceSync.getRelatedDevices(direction);
    },

    getUnconnectedCastTargets: function() {
      return this.deviceSync.getUnconnectedCastTargets();
    },

    getPossibleCastTargets: function() {
      return this.deviceSync.getPossibleCastTargets();
    },

    relateDevice: function(owner, device, relativePosition) {
      return this.deviceSync.relate(owner, device, relativePosition);
    },

    cast: function(owner, device, spec) {
      var self = this;
      return this.clientPromise(naming.rpcMount(owner, device))
        .then(function(s) {
          return self.vanadiumWrapperPromise.then(function(vanadiumWrapper) {
            return s.cast(vanadiumWrapper.context(),
              new vdlTravel.CastSpec(spec));
          });
        });
    }
  },

  privates: {
    processUpdates: function(data) {
      this.deviceSync.processDevices(data.devices);

      this.tripManager.processTrips(data.user && data.user.tripMetadata,
        data.trips);

      this.messageSync.processMessages(this.tripManager.getMessageData());
      this.destinationSync.processDestinations(
        this.tripManager.getDestinationData());

      this.tripManager.setUpstream();
    },

    getRpcEndpoint: function(args) {
      return vanadium.naming.join(args.mountNames.device, 'rpc');
    },

    serve: function(args) {
      var self = this;
      var vanadiumWrapper = args.vanadiumWrapper;

      this.status.rpc = 'starting';
      return vanadiumWrapper.server(args.mountNames.rpc, this.server)
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

    createPrimarySyncgroup: function(syncgroupManager) {
      var self = this;

      this.status.userSyncgroup = 'creating';
      return syncgroupManager.createSyncgroup('user', [[]],
        [syncgroupManager.identity.username])
        .then(function(sg) {
          self.status.userSyncgroup = 'created';
          return sg;
        }, function(err) {
          self.status.userSyncgroup = 'failed';
          throw err;
        });
    },

    handleCast: function(ctx, serverCall, spec) {
      debug.log('Cast target for ' + spec.panelName);
      this.onReceiveCast(spec);
    },

    clientPromise: function(endpoint) {
      var clientPromise = this.clients[endpoint];
      if (!clientPromise) {
        clientPromise = this.clients[endpoint] = this.vanadiumWrapperPromise
          .then(function(vanadiumWrapper) {
            return vanadiumWrapper.client(endpoint);
          });
      }

      return clientPromise;
    }
  },

  constants: [ 'invitationManager', 'startup', 'status' ],
  events: {
    /**
     * @param spec
     */
    onReceiveCast: '',

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
     * Triggered when devices are discovered (possibly) nearby, where none were
     * present before.
     */
    onPossibleNearbyDevices: '',

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
    this.maps = mapsDependencies.maps;

    this.tripStatus = {};
    this.status = {};
    this.clients = {};

    this.server = new vdlTravel.Travel();
    this.server.cast = function(ctx, serverCall, spec) {
      self.handleCast(ctx, serverCall, spec);
    };
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
    var createPrimarySyncgroup = this.startSyncgroupManager
      .then(this.createPrimarySyncgroup);

    this.vanadiumWrapperPromise = prereqs.then(function(args) {
      return args.vanadiumWrapper;
    });
    var usernamePromise = prereqs.then(function(args) {
      return args.identity.username;
    });

    this.tripManager = new TripManager(
      usernamePromise, sbw, this.startSyncgroupManager);
    this.messageSync = new MessageSync(sbw, this.tripManager);
    this.destinationSync = new DestinationSync(
      mapsDependencies, sbw, this.tripManager);

    this.messageSync.onMessages.add(this.onMessages);

    this.deviceSync = new DeviceSync(mapsDependencies.maps,
        prereqs.then(function(args) { return args.identity; }),
        self.sbw);
    this.deviceSync.onError.add(this.onError);
    this.deviceSync.onPossibleNearbyDevices.add(this.onPossibleNearbyDevices);

    this.startup = Promise.all([
        startRpc,
        startSyncbase,
        this.startSyncgroupManager,
        createPrimarySyncgroup
      ]).then(function(values) {
        return {
          server: values[0],
          syncbase: values[1],
          groupManager: values[2]
        };
      });

    this.invitationManager = new InvitationManager(this.startSyncgroupManager);
    this.invitationManager.onError.add(this.onError);
  }
});

module.exports = TravelSync;
