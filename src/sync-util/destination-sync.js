// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var _ = require('lodash');
var uuid = require('uuid');

var debug = require('../debug');
var Place = require('../place');

var marshalling = require('./marshalling');

var DESTINATION_SCHEMA = [ 'place' ];

var DestinationSync = defineClass({
  statics: {
    getDestinationIds: function(destinationsData) {
      return marshalling.readValue(destinationsData);
    },
  },

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

    processDestinations: function(destinationsData) {
      var self = this;

      if (!destinationsData) {
        if (this.tripManager.hasValidUpstream()) {
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
            marshalling.unmarshal(destinationData.place);

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
          var self = this;

          if (this.isValid()) {
            var key = this.key();
            var fieldIdx = key.length;
            var writes = [];

            $.each(DESTINATION_SCHEMA, function() {
              key[fieldIdx] = this;
              var value = self.data[this];
              writes.push(value?
                dao.put(key, marshalling.marshal(value)) : dao.delete(key));
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
          return this.outer.tripManager.getDestinationsKey(this.id);
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

    handleDestinationAdd: function (destination) {
      var self = this;

      var index = destination.getIndex();
      var record = this.destRecords[index];

      if (!record || record.isValid()) {
        var place = destination.getPlace();

        record = this.destinationRecord(place, true);

        debug.log('Adding destination ' + index + ':' + record.getId());

        this.destRecords.splice(index, 0, record);

        if (this.tripManager.hasValidUpstream()) {
          this.sbw.batch(function(ops) {
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
      if (this.tripManager.hasValidUpstream() && removed.isValid()) {
        debug.log('Removing destination ' + index + ':' + removed.getId());
        this.sbw.batch(function(ops) {
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
          if (self.tripManager.hasValidUpstream()) {
            debug.log('Updating destination ' + index + ':' + this.getId() +
              '.place = ' + JSON.stringify(oldPlace) + ' => ' +
              JSON.stringify(placeData));

            self.sbw.nonBatched(this.put);
          }
        });
      }
    },

    pushDestinations: function(force) {
      var self = this;

      this.sbw.batch(function(ops) {
        if (!self.tripManager.getActiveTripId()) {
          if (force) {
            self.tripManager.setActiveTripId(uuid.v4());
          } else {
            return;
          }
        }

        self.tripManager.setUpstream();

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
      return dao.put(this.tripManager.getDestinationsKey(),
        marshalling.marshal(ids));
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
    }
  },

  init: function(mapsDependencies, deferredSyncbaseWrapper, tripManager) {
    var self = this;

    this.mapsDeps = mapsDependencies;
    this.sbw = deferredSyncbaseWrapper;
    this.tripManager = tripManager;
    this.destRecords = [];

    this.handleDestinationPlaceChange = function() {
      self.updateDestinationPlace(this);
    };
  }
});

module.exports = DestinationSync;
