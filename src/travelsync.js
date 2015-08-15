// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var _ = require('lodash');
var queryString = require('query-string');
var uuid = require('uuid');
var vanadium = require('vanadium');

var $ = require('./util/jquery');
var defineClass = require('./util/define-class');

var debug = require('./debug');
var SyncgroupManager = require('./syncgroup-manager');
var InvitationManager = require('./invitation-manager');
var Place = require('./place');

var vdlTravel = require('../ifc');

var DESTINATION_SCHEMA = [ 'place' ];

var TravelSync = defineClass({
  /* Schema note: although we don't support merging destination list structure
   * changes, we use indirection in the destination list so that we don't have
   * to move multiple keys on random insertion or deletion and can still support
   * parallel destination edits. */
  publics: {
    bindDestinations: function(destinations) {
      if (this.destinations) {
        this.destinations.onAdd.remove(this.handleDestinationAdd);
        this.destinations.onRemove.remove(this.handleDestinationRemove);
      }

      this.destinations = destinations;

      if (destinations) {
        destinations.onAdd.add(this.handleDestinationAdd);
        destinations.onRemove.add(this.handleDestinationRemove);
      }
    },

    message: function(messageContent) {
      var self = this;

      var id = uuid.v4();
      var payload = $.extend({
        timestamp: Date.now()
      }, messageContent);
      var value = this.marshal(payload);

      this.startSyncbase.then(function(syncbase) {
        return syncbase.put(['trips', self.upstreamId, 'messages', id], value);
      }).catch(this.onError);
    },

    pushTrip: function() {
    },

    pushStatus: function() {
    },

    getActiveTripId: function() {
      return this.activeTripId;
    },

    getActiveTripOwner: function() {
      return this.activeTripOwner;
    },

    setActiveTripId: function(tripId, pull) {
      var self = this;

      this.activeTripId = tripId;
      /* We could use cached state, but we don't want to do state updates in
       * response to a pull while any writes are going on. */
      return this.startSyncbase.then(function(syncbase) {
        syncbase.put(['user', 'tripMetadata', tripId, 'latestSwitch'],
          Date.now()).catch(self.onError);

        return pull? syncbase.refresh() : Promise.resolve();
      });
    },

    getData: function() {
      return this.startSyncbase.then(function(syncbase) {
        return syncbase.getData();
      });
    },

    /**
     * Sets the active trip to the given trip ID after it is available.
     */
    watchForTrip: function(tripId) {
      this.awaitedTripId = tripId;
    },

    joinTripSyncGroup: function(owner, tripId) {
      return this.startSyncgroupManager.then(function(gm) {
        return gm.joinSyncGroup(owner, 'trip-' + tripId);
      });
    }
  },

  privates: {
    destinationRecord: defineClass.innerClass({
      publics: {
        isValid: function() {
          return this.id !== undefined;
        },

        invalidate: function() {
          delete this.id;
        },

        getId: function() {
          return this.id;
        },

        setId: function(id) {
          this.id = id;
        },

        /**
         * @param placeData the plain object representation of a `Place`.
         * @param changedCallback a function called if the place is actually
         *  changed, with the params newPlace, oldPlace, as the new and old
         *  plain object places, respectively.
         */
        setPlaceData: function(placeData, changedCallback) {
          var old = this.data.place;
          if (!_.isEqual(old, placeData) && (old || placeData)) {
            this.data.place = placeData;

            this.cancelPlaceAsync();

            if (changedCallback) {
              changedCallback.call(this.ifc, placeData, old);
            }
          }
        },

        put: function(dao) {
          var outer = this.outer;
          var self = this;

          if (this.isValid()) {
            var key = this.key();
            var fieldIdx = key.length;
            var writes = [];

            $.each(DESTINATION_SCHEMA, function() {
              key[fieldIdx] = this;
              var value = self.data[this];
              writes.push(value?
                dao.put(key, outer.marshal(value)) : dao.delete(key));
            });
            return Promise.all(writes);
          } else {
            return Promise.resolve();
          }
        },

        delete: function(dao) {
          if (this.isValid()) {
            return dao.delete(this.key());
          } else {
            return Promise.resolve();
          }
        },
      },

      privates: {
        key: function() {
          return ['trips', this.outer.upstreamId, 'destinations', this.id];
        }
      },

      events: {
        /**
         * Utility event to allow asynchronous update processes to cancel if
         * they do not finish by the time the place has been updated again.
         */
        cancelPlaceAsync: 'once'
      },

      init: function(place, generateId) {
        if (generateId) {
          this.id = uuid.v4();
        }

        this.data = {
          place: place && place.toObject()
        };
      }
    }),

    batch: function(fn) {
      this.startSyncbase.then(function(syncbase) {
        return syncbase.batch(fn);
      }).catch(this.onError);
    },

    nonBatched: function(fn) {
      var self = this; //not really necessary but semantically correct
      var fnArgs = Array.prototype.slice.call(arguments, 1);
      this.startSyncbase.then(function(syncbase) {
        fnArgs.splice(0, 0, syncbase);
        return fn.apply(self, fnArgs);
      }).catch(this.onError);
    },

    handleDestinationAdd: function (destination) {
      var self = this;

      var index = destination.getIndex();
      var record = this.destRecords[index];

      if (!record || record.isValid()) {
        var place = destination.getPlace();

        record = this.destinationRecord(place, true);

        debug.log('Adding destination ' + index + ':' + record.getId());

        this.destRecords.splice(index, 0, record);

        if (this.hasValidUpstream()) {
          this.batch(function(ops) {
            return Promise.all([
              self.putDestinationIds(ops),
              record.put(ops)
            ]);
          });
        }
      }

      destination.onPlaceChange.add(this.handleDestinationPlaceChange);
    },

    handleDestinationRemove: function(destination) {
      var self = this;

      var index = destination.getIndex();
      var removed = this.destRecords.splice(index, 1)[0];
      if (this.hasValidUpstream() && removed.isValid()) {
        debug.log('Removing destination ' + index + ':' + removed.getId());
        this.batch(function(ops) {
          return Promise.all([
            self.putDestinationIds(ops),
            removed.delete(ops)
          ]);
        });
      }
    },

    updateDestinationPlace: function(destination) {
      var self = this;

      var index = destination.getIndex();
      var record = this.destRecords[index];
      var place = destination.getPlace();
      var placeData = place && place.toObject();

      if (record && record.isValid()) {
        record.setPlaceData(placeData, function(placeData, oldPlace) {
          if (self.hasValidUpstream()) {
            debug.log('Updating destination ' + index + ':' + this.getId() +
              '.place = ' + JSON.stringify(oldPlace) + ' => ' +
              JSON.stringify(placeData));

            self.nonBatched(this.put);
          }
        });
      }
    },

    pushDestinations: function(force) {
      var self = this;

      this.batch(function(ops) {
        if (!self.activeTripId) {
          if (force) {
            self.activeTripId = uuid.v4();
          } else {
            return;
          }
        }

        self.setUpstream();

        var asyncs = self.destRecords.map(function(record) {
          return record.put(ops);
        });
        asyncs.push(self.putDestinationIds(ops));
        return Promise.all(asyncs);
      });
    },

    /* A note on these operations: Syncbase client operations occur
     * asynchronously, in response to events that can rapidly change state. As
     * such, each write operation must first check to ensure the record it's
     * updating for is still valid (has a defined id).
     */

    putDestinationIds: function(dao) {
      var ids = this.destRecords
        .filter(function(r) { return r.isValid(); })
        .map(function(r) { return r.getId(); });
      return dao.put(['trips', this.upstreamId, 'destinations'],
        this.marshal(ids));
    },

    marshal: function(x) {
      return JSON.stringify(x);
    },

    unmarshal: function(x) {
      return x && JSON.parse(x);
    },

    truncateDestinations: function(targetLength) {
      if (this.destinations.count() > targetLength) {
        debug.log('Truncating destinations to ' + targetLength);
      }

      while (this.destinations.count() > targetLength) {
        var last = this.destinations.count() - 1;
        this.destRecords[last].invalidate();
        this.destinations.remove(last);
      }
    },

    processMessages: function(messageData) {
      var self = this;

      if (messageData) {
        /* Dispatch new messages in time order, though don't put them before
         * local messages. */
        var newMessages = [];
        $.each(messageData, function(id, serializedMessage) {
          if (!self.messages[id]) {
            var message = self.unmarshal(serializedMessage);
            newMessages.push(message);
            self.messages[id] = message;
          }
        });
        newMessages.sort(function(a, b) {
          return a.timestamp < b.timestamp? -1 :
                 a.timestamp > b.timestamp?  1 :
                                             0;
        });

        this.onMessages(newMessages);
      }
    },

    getDestinationIds: function(destinationsData) {
      return this.unmarshal(typeof destinationsData === 'object'?
        destinationsData._ : destinationsData);
    },

    processDestinations: function(destinationsData) {
      var self = this;

      if (!destinationsData) {
        if (this.hasValidUpstream()) {
          this.truncateDestinations(0);
        } else {
          //first push with no remote data; push local data as authority
          this.pushDestinations();
        }

      } else {
        var ids;
        try {
          ids = this.getDestinationIds(destinationsData);
          if (!ids) {
            throw new TypeError('Missing destination IDs');
          }
        } catch(e) {
          this.onError(e);
          //assume it's corrupt and overwrite
          this.pushDestinations(true);
          return;
        }

        $.each(ids, function(i, id) {
          /* Don't bother reordering existing destinations by ID; instead, just
           * overwrite everything. TODO(rosswang): optimize to reorder. */
          var record = self.destRecords[i];
          var destination = self.destinations.get(i);

          if (!record) {
            /* Add the record invalid so that the destination add handler leaves
             * population to this handler. */
            record = self.destRecords[i] = self.destinationRecord();
            destination = self.destinations.add(i);
          }

          if (record.getId() !== id) {
            record.setId(id);
            debug.log('Pulling destination ' + i + ':' + id);
          }

          var destinationData = destinationsData[id];
          var newPlace = destinationData &&
            self.unmarshal(destinationData.place);

          record.setPlaceData(newPlace, function(newPlace, oldPlace) {
            debug.log('Pulled update for destination ' + i + ':' + id +
              '.place = ' + JSON.stringify(oldPlace) + ' => ' +
              JSON.stringify(newPlace));

            if (newPlace) {
              var cancelled = false;
              record.cancelPlaceAsync.add(function() {
                cancelled = true;
              });

              Place.fromObject(self.mapsDeps, newPlace)
                .catch(function(err) {
                  //assume it's corrupt and overwrite
                  if (!cancelled) {
                    self.updateDestinationPlace(destination);
                    throw err;
                  }
                })
                .then(function(place) {
                  if (!cancelled) {
                    destination.setPlace(place);
                  }
                }).catch(function(err) {
                  self.onError(err);
                });
            } else {
              destination.setPlace(null);
            }
          });
        });

        if (this.destRecords.length > ids.length) {
          /* TODO(rosswang): There is an edge case where this happens due to
           * user interaction even though normally pulls are blocked while
           * writes are outstanding. This can probably also happen on startup.
           * Debug this or better yet make it go away. */
          this.truncateDestinations(ids.length);
        }
      }

      this.setUpstream();
    },

    deleteTrip: function(tripId) {
      this.batch(function(ops) {
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
      var self = this;
      var best = {};

      $.each(trips, function(id, trip) {
        var md = userTripMetadata && userTripMetadata[id];
        var latestSwitch = md && md.latestSwitch;

        function usurp() {
          best.trip = trip;
          best.id = id;
          best.latestSwitch = latestSwitch;
          delete best.length;
        }

        if (latestSwitch === best.latestSwitch) {
          if (!best.trip) {
            usurp();
          } else {
            if (best.length === undefined) {
              best.length = self.getDestinationIds(
                best.trip.destinations).length;
            }
            var length = self.getDestinationIds(trip.destinations).length;
            if (length > best.length) {
              usurp();
              best.length = length;
            } else if (length === best.length && id < best.id) {
              usurp();
              best.length = length;
            }
          }
        } else if (latestSwitch && best.latestSwitch === undefined ||
            latestSwitch > best.latestSwitch) {
          usurp();
        }
      });

      return best.id;
    },

    isNascent: function(trip) {
      return !trip.destinations ||
        this.getDestinationIds(trip.destinations).length <= 1;
    },

    manageTripSyncGroups: function(trips) {
      var self = this;

      //TODO(rosswang): maybe make this more intelligent, and handle ejection
      if (trips) {
        $.each(trips, function(tripId, trip) {
          /* Join is idempotent, but repeatedly joining might be causing major,
           * fatal sluggishness. TODO(rosswang): if this is not the case, maybe
           * go ahead and poll. */
          if (!self.joinedTrips.has(tripId) && trip.owner) {
            self.joinedTrips.add(tripId);
            self.joinTripSyncGroup(trip.owner, tripId).catch(self.onError);
          }
        });
      }
    },

    processTrips: function(userTripMetadata, trips) {
      var self = this;

      this.manageTripSyncGroups(trips);

      var trip;

      if (this.awaitedTripId) {
        this.setActiveTripId(this.awaitedTripId, false);
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
          trip = {}; //don't initialize owner until the syncgroup is ready
          this.startSyncgroupManager.then(function(gm) {
            return self.createTripSyncGroup(gm, tripId)
              .then(function(sg) {
                return gm.syncbaseWrapper.put(['trips', tripId, 'owner'],
                  self.invitationManager.getUsername()).then(function() {
                    return sg;
                  });
              })
              .catch(self.onError);
          });
        }
      }

      this.activeTripOwner = trip.owner;
      this.processMessages(trip.messages);
      this.processDestinations(trip.destinations);
    },

    processUpdates: function(data) {
      this.processTrips(data.user && data.user.tripMetadata, data.trips);
    },

    hasValidUpstream: function() {
      return this.upstreamId && this.upstreamId === this.activeTripId;
    },

    setUpstream: function() {
      this.upstreamId = this.activeTripId;
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

      var sbName = queryString.parse(location.search).syncbase || 4000;
      if ($.isNumeric(sbName)) {
        sbName = '/localhost:' + sbName;
      }

      this.status.syncbase = 'starting';
      return vanadiumWrapper
        .syncbase(sbName)
        .then(function(syncbase) {
          syncbase.onError.add(self.onError);
          syncbase.onUpdate.add(self.processUpdates);
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
    },

    createTripSyncGroup: function(groupManager, tripId) {
      return groupManager.createSyncGroup('trip-' + tripId,
        [['trips', tripId]]);
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
   */
  init: function(prereqs, mapsDependencies) {
    var self = this;

    this.mapsDeps = mapsDependencies;

    this.tripStatus = {};
    this.messages = {};
    this.destRecords = [];
    this.status = {};
    this.joinedTrips = new Set();

    this.server = new vdlTravel.TravelSync();
    var startRpc = prereqs.then(this.serve);
    var startSyncbase = this.startSyncbase = prereqs.then(this.connectSyncbase);
    this.startSyncgroupManager = Promise
      .all([prereqs, startSyncbase])
      .then(function(args) {
        return self.createSyncgroupManager(args[0], args[1]);
      });
    var createPrimarySyncGroup = this.startSyncgroupManager
      .then(this.createPrimarySyncGroup);

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

    this.invitationManager = new InvitationManager(prereqs,
      this.startSyncgroupManager);
    this.invitationManager.onError.add(this.onError);

    this.handleDestinationPlaceChange = function() {
      self.updateDestinationPlace(this);
    };
  }
});

module.exports = TravelSync;
