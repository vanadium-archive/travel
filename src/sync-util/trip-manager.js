// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var _ = require('lodash');
var uuid = require('uuid');

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var debug = require('../debug');

var getTripLength = require('./get-trip-length');
var tripComparator = require('./trip-comparator');

var TripManager = defineClass({
  statics: {
    getTripLength: getTripLength
  },

  publics: {
    /**
     * Sets the active trip to the given trip ID after it is available.
     */
    watchForTrip: function(tripId) {
      this.awaitedTripId = tripId;
    },

    getDestinationData: function() {
      return this.activeTrip && this.activeTrip.destinations;
    },

    getActiveTripId: function() {
      return this.activeTripId;
    },

    getActiveTripOwner: function() {
      return this.activeTrip && this.activeTrip.owner;
    },

    setActiveTripId: function(tripId) {
      var old = this.activeTripId;
      this.activeTripId = tripId;
      this.sbw.put(['user', 'tripMetadata', tripId, 'latestSwitch'],
        Date.now());

      if (old !== tripId) {
        this.activeTrip = null;
        this.activeTripOwner = null;
      }
    },

    hasValidUpstream: function() {
      return this.upstreamTripId && this.upstreamTripId === this.activeTripId;
    },

    getTripKey: function() {
      return ['trips', this.upstreamTripId].concat(_.flattenDeep(arguments));
    },

    getDestinationsKey: function() {
      return this.getTripKey('destinations', arguments);
    },

    getMessagesKey: function() {
      return this.getTripKey('messages', arguments);
    },

    /**
     * This should be called whenever the upstream should be considered ready to
     * receive updates from local, i.e. after refreshing from remote or before
     * pushing from local.
     */
    setUpstream: function() {
      if (this.upstreamTripId !== this.activeTripId) {
        this.upstreamTripId = this.activeTripId;
        this.onTripChange(this.upstreamTripId);
      }
    },

    processTrips: function(userTripMetadata, trips) {
      var self = this;

      var trip;

      if (this.awaitedTripId) {
        this.setActiveTripId(this.awaitedTripId);
        delete this.awaitedTripId;

        /* Override latestSwitch this frame. (Subsequently syncbase will be up
         * to date.) */
        if (!userTripMetadata) {
          userTripMetadata = {};
        }
        var activeTripMd = userTripMetadata[this.activeTripId];
        if (!activeTripMd) {
          activeTripMd = userTripMetadata[this.activeTripId] = {};
        }
        activeTripMd.latestSwitch = Date.now();
      }

      if (this.activeTripId) {
        trip = trips && trips[this.activeTripId];
        if (!trip) {
          debug.log('Last active trip ' + this.activeTripId +
            ' is no longer present.');
        } else {
          var defaultId = this.getDefaultTrip(userTripMetadata, trips);
          if (defaultId && defaultId !== this.activeTripId &&
              trips[defaultId]) {
            if (this.isNascent(trip)) {
              this.deleteTrip(this.activeTripId);
              debug.log('Replacing nascent trip ' + this.activeTripId +
                ' with established trip ' + defaultId);
            } else {
              /* TODO(rosswang): for now, sync trip changes. This behavior may
               * change. */
              debug.log('Replacing active trip ' + this.activeTripId +
                ' with most recent selection ' + defaultId);
            }

            this.activeTripId = defaultId;
            trip = trips[defaultId];
          }
        }
      }

      if (!trip) {
        if (trips) {
          this.activeTripId = this.getDefaultTrip(userTripMetadata, trips);
          debug.log('Setting active trip ' + this.activeTripId);
          trip = trips[this.activeTripId];
        } else {
          var tripId = this.activeTripId = uuid.v4();
          debug.log('Creating new trip ' + tripId);
          trip = {};
          this.startSyncgroupManager.then(function(sgm) {
            return sgm.syncbaseWrapper.put(['trips', tripId, 'owner'],
                sgm.identity.username)
              .catch(self.onError);
          });
        }
      }

      this.activeTrip = trip;
    }
  },

  privates: {
    deleteTrip: function(tripId) {
      this.sbw.batch(function(ops) {
        return Promise.all([
          ops.delete(['user', 'tripMetadata', tripId]),
          ops.delete(['trips', tripId])
        ]);
      });
    },

    /**
     * Given a mapping of trip IDs to trip info with metadata, pick the trip
     * that the user is most likely to care about.
     */
    getDefaultTrip: function(userTripMetadata, trips) {
      var best;

      $.each(trips, function(id, trip) {
        var md = userTripMetadata && userTripMetadata[id];
        var latestSwitch = md && md.latestSwitch;

        var candidate =
          new tripComparator.ComparableTrip(trip, id, latestSwitch);

        if (tripComparator.compareTrips(best, candidate) > 0) {
          best = candidate;
        }
      });

      return best && best.id;
    },

    isNascent: function(trip) {
      return this.getTripLength(trip) <= 1;
    }
  },

  events: [
    /**
     * @param tripId
     */
    'onTripChange'
  ],

  init: function(usernamePromise, deferredSyncbaseWrapper,
      startSyncgroupManager) {
    this.usernamePromise = usernamePromise;
    this.sbw = deferredSyncbaseWrapper;
    this.startSyncgroupManager = startSyncgroupManager;
    this.joinedTrips = new Set();
  }
});

module.exports = TripManager;