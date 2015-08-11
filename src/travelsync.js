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
      var id = uuid.v4();
      var payload = $.extend({
        timestamp: Date.now()
      }, messageContent);
      var value = this.marshal(payload);

      this.startup.then(function(services) {
        return services.syncbase.put(['messages', id], value);
      }).catch(this.onError);
    },

    pushTrip: function() {
    },

    pushStatus: function() {
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
            var key = ['destinations', this.id];
            var writes = [];

            $.each(DESTINATION_SCHEMA, function() {
              key[2] = this;
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
            return dao.delete(['destinations', this.id]);
          } else {
            return Promise.resolve();
          }
        },
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
      this.startup.then(function(services) {
        return services.syncbase.batch(fn);
      }).catch(this.onError);
    },

    nonBatched: function(fn) {
      var self = this; //not really necessary but semantically correct
      var fnArgs = Array.prototype.slice.call(arguments, 1);
      this.startup.then(function(services) {
        fnArgs.splice(0, 0, services.syncbase);
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

        if (this.hasUpstream) {
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
      if (this.hasUpstream && removed.isValid()) {
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
          if (self.hasUpstream) {
            debug.log('Updating destination ' + index + ':' + this.getId() +
              '.place = ' + JSON.stringify(oldPlace) + ' => ' +
              JSON.stringify(placeData));

            self.nonBatched(this.put);
          }
        });
      }
    },

    pushDestinations: function() {
      var self = this;

      this.batch(function(ops) {
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
      return dao.put(['destinations'], this.marshal(ids));
    },

    marshal: function(x) {
      return JSON.stringify(x);
    },

    unmarshal: function(x) {
      return JSON.parse(x);
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

    processDestinations: function(destinationsData) {
      var self = this;

      if (!destinationsData) {
        if (this.hasUpstream) {
          this.truncateDestinations(0);
        } else {
          //first push with no remote data; push local data as authority
          this.pushDestinations();
        }

      } else {
        var ids;
        try {
          ids = this.unmarshal(destinationsData._ || destinationsData);
        } catch(e) {
          this.onError(e);
          //assume it's corrupt and overwrite
          this.pushDestinations();
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
          this.truncateDestinations(ids.length);
        }
      }

      this.hasUpstream = true;
    },

    processUpdates: function(data) {
      this.processMessages(data.messages);
      this.processDestinations(data.destinations);
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

      this.status.tripSyncGroup = 'creating';
      return groupManager.createSyncGroup('trip', [''])
        .then(function(sg) {
          self.status.tripSyncGroup = 'created';
          return sg;
        }, function(err) {
          self.status.tripSyncGroup = 'failed';
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
   */
  init: function(prereqs, mapsDependencies) {
    var self = this;

    this.mapsDeps = mapsDependencies;

    this.tripStatus = {};
    this.messages = {};
    this.destRecords = [];
    this.status = {};

    this.server = new vdlTravel.TravelSync();
    var startRpc = prereqs.then(this.serve);
    var startSyncbase = prereqs.then(this.connectSyncbase);
    var startSyncgroupManager = Promise
      .all([prereqs, startSyncbase])
      .then(function(args) {
        return self.createSyncgroupManager(args[0], args[1]);
      });
    var createPrimarySyncGroup = startSyncgroupManager
      .then(this.createPrimarySyncGroup);

    this.startup = Promise.all([
        startRpc,
        startSyncbase,
        startSyncgroupManager,
        createPrimarySyncGroup
      ]).then(function(values) {
        return {
          server: values[0],
          syncbase: values[1],
          groupManager: values[2]
        };
      });

    this.invitationManager = new InvitationManager(prereqs,
      startSyncgroupManager);
    this.invitationManager.onError.add(this.onError);

    this.handleDestinationPlaceChange = function() {
      self.updateDestinationPlace(this);
    };
  }
});

module.exports = TravelSync;
