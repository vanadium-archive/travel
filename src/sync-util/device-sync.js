// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var _ = require('lodash');
var Multimap = require('multimap');

var marshalling = require('./marshalling');
var SyncbaseWrapper = require('../vanadium-wrapper/syncbase-wrapper');
var escape = SyncbaseWrapper.escapeKeyElement;
var unescape = SyncbaseWrapper.unescapeKeyElement;

var HEARTBEAT_PERIOD = 2500; //ms
var DEVICE_SEEN_RECENTLY = 5000; //ms

var LEFT = 'left';
var RIGHT = 'right';
var UP = 'up';
var DOWN = 'down';
var FORWARDS = 'forwards';
var BACKWARDS = 'backwards';

var NEAR = 'near';
var FAR = 'far';

var RE = 6.371e6;

function cartesian(geo) {
  var lat = geo.latitude * Math.PI / 180;
  var lng = geo.longitude * Math.PI / 180;
  var planeFactor = Math.cos(lat);

  return {
    x: RE * Math.cos(lng) * planeFactor,
    y: RE * Math.sin(lng) * planeFactor,
    z: RE * Math.sin(lat)
  };
}

function negateVector(vector) {
  return {
    x: -vector.x,
    y: -vector.y,
    z: -vector.z
  };
}

function negateDirection(direction) {
  switch(direction) {
  case LEFT:
    return RIGHT;
  case RIGHT:
    return LEFT;
  case UP:
    return DOWN;
  case DOWN:
    return UP;
  case FORWARDS:
    return BACKWARDS;
  case BACKWARDS:
    return FORWARDS;
  default:
    return {
      mean: negateVector(direction.mean),
      margin: direction.margin
    };
  }
}

var DeviceSync = defineClass({
  statics: {
    LEFT: LEFT,
    RIGHT: RIGHT,
    UP: UP,
    DOWN: DOWN,
    FORWARDS: FORWARDS,
    BACKWARDS: BACKWARDS,
    NEAR: NEAR,
    FAR: FAR,

    deviceKey: function(owner, device) {
      var mutableArgs = _.flattenDeep(arguments);
      //arguments 0 and 1 are a username and device ID, respectively
      //if present, arguments 3 and 4 are that way too
      for (var i = 0; i <= 4; i++) {
        if (mutableArgs[i] && i !== 2) {
          mutableArgs[i] = escape(mutableArgs[i]);
        }
      }
      return ['devices'].concat(mutableArgs);
    },

    negateRelativePosition: function(relativePosition) {
      return {
        direction: negateDirection(relativePosition.direction),
        magnitude: relativePosition.magnitude
      };
    }
  },

  publics: {
    relate: function(remoteOwner, remoteDevice, relativePosition) {
      var self = this;

      return this.identityPromise.then(function(identity) {
        return self.sbw.batch(function(ops) {
          return Promise.all([
            self.relateUnidirectional(ops,
              identity.username, identity.deviceName,
              remoteOwner, remoteDevice,
              relativePosition),
            self.relateUnidirectional(ops,
              remoteOwner, remoteDevice,
              identity.username, identity.deviceName,
              self.negateRelativePosition(relativePosition))]);
        });
      });
    },

    getRelatedDevices: function(direction) {
      return this.relatedDevices.get(direction) || new Multimap();
    },

    getUnconnectedCastTargets: function() {
      return this.unconnectedCastTargets;
    },

    getPossibleCastTargets: function() {
      return this.possibleCastTargets;
    },

    processDevices: function(data) {
      var self = this;
      var now = Date.now();
      var possibleCastTargets = new Multimap();
      var unconnectedCastTargets = new Multimap();
      var connections;

      this.identityPromise.then(function(identity) {
        var hasCastTargets;
        $.each(data, function(owner, devices) {
          owner = unescape(owner);

          $.each(devices, function(deviceName, deviceData) {
            deviceName = unescape(deviceName);
            if (owner === identity.username &&
                deviceName === identity.deviceName) {
              connections = deviceData.connections;
            } else if (now - deviceData.lastSeen <= DEVICE_SEEN_RECENTLY) {
              var deviceLocation = marshalling.unmarshal(deviceData.location);
              var isNearby = self.isNearby(deviceLocation);

              if (isNearby !== false) {
                hasCastTargets = true;
                possibleCastTargets.set(owner, deviceName);
                unconnectedCastTargets.set(owner, deviceName);
              }
            }
          });
        });

        /* This could just be a multimap of direction => {owner, deviceName},
         * but to keep the interface consistent we should have the RHS be a
         * multimap of owner => deviceName. */
        var relatedDevices = new Map();

        if (connections) {
          $.each(connections, function(owner, devices) {
            owner = unescape(owner);
            $.each(devices, function(deviceName, relPos) {
              deviceName = unescape(deviceName);
              if (unconnectedCastTargets.has(owner, deviceName)) {
                relPos = marshalling.unmarshal(relPos);
                // TODO(rosswang): handle vector directions
                var bucket = relatedDevices.get(relPos.direction);
                if (!bucket) {
                  relatedDevices.set(relPos.direction, bucket = new Multimap());
                }

                bucket.set(owner, deviceName);
                unconnectedCastTargets.delete(owner, deviceName);
              }
            });
          });
        }

        if (hasCastTargets && !self.hasCastTargets) {
          self.onPossibleNearbyDevices();
        }

        self.hasCastTargets = hasCastTargets;
        self.possibleCastTargets = possibleCastTargets;
        self.unconnectedCastTargets = unconnectedCastTargets;
        self.relatedDevices = relatedDevices;
      }).catch(this.onError);
    }
  },

  privates: {
    relateUnidirectional: function(dao, fromOwner, fromDevice,
        toOwner, toDevice, relativePosition) {
      return dao.put(this.deviceKey(
        fromOwner, fromDevice, 'connections', toOwner, toDevice),
        marshalling.marshal(relativePosition));
    },

    heartbeat: function() {
      var self = this;
      return this.identityPromise.then(function(identity) {
        return self.sbw.put(
          self.deviceKey(identity.username, identity.deviceName, 'lastSeen'),
          Date.now());
      });
    },

    updateGeolocation: function(geolocation) {
      var self = this;

      this.geolocation = geolocation;

      return this.identityPromise.then(function(identity) {
        return self.sbw.put(
          self.deviceKey(identity.username, identity.deviceName, 'location'),
          self.serializeGeolocation(geolocation));
      });
    },

    /**
     * The properties on these objects don't appear to be enumerable, so
     * serialize them explicitly here.
     */
    serializeGeolocation: function(geolocation) {
      var coords = geolocation.coords;
      return marshalling.marshal({
        coords: {
          accuracy: coords.accuracy,
          altitude: coords.altitude,
          altitudeAccuracy: coords.altitudeAccuracy,
          heading: coords.heading,
          latitude: coords.latitude,
          longitude: coords.longitude,
          speed: coords.speed
        },
        timestamp: geolocation.timestamp
      });
    },

    /**
     * The true calculation here would involve the distance between two
     * cylinders in spherical space... let's just punt on that for now.
     *
     * TODO(rosswang): find a library or factor this out.
     * location-math seems ideal but doesn't seem to contain any code
     * coordinate-systems may be suitable
     *
     * Also, if we keep doing this based on Cartesian coordinates, cache the
     * current Cartesian location.
     */
    isNearby: function(geolocation) {
      var a = this.geolocation && this.geolocation.coords || {};
      var b = geolocation && geolocation.coords || {};

      if (typeof a.altitude === 'number' && typeof b.altitude === 'number' &&
          typeof a.altitudeAccuracy === 'number' &&
          typeof b.altitudeAccuracy === 'number' &&
          Math.abs(a.altitude - b.altitude) >
          a.altitudeAccuracy + b.altitudeAccuracy + 50) {
        return false;
      }

      if (typeof a.latitude === 'number' && typeof b.latitude === 'number' &&
          typeof a.longitude === 'number' && typeof b.longitude === 'number' &&
          typeof a.accuracy === 'number' && typeof b.accuracy === 'number') {
        var va = cartesian(a);
        var vb = cartesian(b);

        var vd = {
          x: va.x - vb.x,
          y: va.y - vb.y,
          z: va.z - vb.z
        };
        var tolerance = a.accuracy + b.accuracy + 50;

        return vd.x * vd.x + vd.y * vd.y + vd.z * vd.z <= tolerance * tolerance;
      }

      //else return undefined
    }
  },

  events: {
    onError: 'memory',
    /**
     * Triggered when devices are discovered (possibly) nearby, where none were
     * present before.
     */
    onPossibleNearbyDevices: ''
  },

  init: function(maps, identityPromise, deferredSyncbaseWrapper) {
    var self = this;

    this.maps = maps;
    this.identityPromise = identityPromise;
    this.sbw = deferredSyncbaseWrapper;

    function heartbeatLoop() {
      self.heartbeat();
      setTimeout(heartbeatLoop, HEARTBEAT_PERIOD);
    }
    process.nextTick(heartbeatLoop);

    if (global.navigator && global.navigator.geolocation) {
      global.navigator.geolocation.watchPosition(this.updateGeolocation);
    }
  }
});

module.exports = DeviceSync;