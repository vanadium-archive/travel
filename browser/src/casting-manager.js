// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var $ = require('./util/jquery');
var defineClass = require('./util/define-class');

var Multimap = require('multimap');

var DeviceSync = require('./sync-util/device-sync');

/**
 * TODO(rosswang): The future of this helper method is a bit unclear given that
 * someday we will want to support actual vectors.
 */
function getGestureDirection(v) {
    if (v.y < 0 && -v.y > Math.abs(v.x)) {
      return DeviceSync.UP;
    }
    if (v.y > 0 && v.y > Math.abs(v.x)) {
      return DeviceSync.DOWN;
    }
    if (v.x < 0) {
      return DeviceSync.LEFT;
    }
    if (v.x > 0) {
      return DeviceSync.RIGHT;
    }
}

/**
 * Multimap union.
 */
function union(a, b) {
  var result = new Multimap();
  function add(value, key) {
    if (!result.has(key, value)) {
      result.set(key, value);
    }
  }
  a.forEach(add);
  b.forEach(add);
  return result;
}

/**
 * Multimap difference.
 */
function difference(u, c) {
  var result = new Multimap();
  u.forEach(function(value, key) {
    if (!c.has(key, value)) {
      result.set(key, value);
    }
  });
  return result;
}

var BN_NONE = 0;
var BN_LEFT = 1;
var BN_MIDDLE = 2;
var BN_RIGHT = 4;

var CastingManager = defineClass({
  publics: {
    /* TODO(rosswang): For now, let's do middle/two-button click and drag as the
     * casting gesture. Eventually, we'll want to evaluate and support others.
     */
    makeCastable: function($handle, opts) {
      var self = this;

      var castHandler = {
        buttons: 0,
        setButton: function(which) {
          this.buttons |= 1 << (which - 1);
        },
        clearButton: function(which) {
          this.buttons &= ~(1 << (which - 1));
        }
      };

      $handle.mousedown(function(e) {
        castHandler.setButton(e.which);
        if (castHandler.buttons === BN_LEFT | BN_RIGHT ||
            castHandler.buttons === BN_MIDDLE) {
          castHandler.origin = {
            x: e.pageX,
            y: e.pageY
          };
        }
      });

      function processMouseUpdate(e) {
        if (castHandler.buttons === BN_NONE && castHandler.origin) {
          self.interpretCastVector({
            x: e.pageX - castHandler.origin.x,
            y: e.pageY - castHandler.origin.y
          }, opts.spec);
          delete castHandler.origin;
        }
      }

      $(global.document).mousemove(function(e) {
        if (e.which === 0) {
          castHandler.buttons = BN_NONE;
          processMouseUpdate(e);
        }
      }).mouseup(function(e) {
        castHandler.clearButton(e.which);
        processMouseUpdate(e);
      });
    }
  },

  privates: {
    getRelatedDevices: function(direction) {
      switch(direction) {
      case DeviceSync.UP:
        return union(this.travelSync.getRelatedDevices(DeviceSync.UP),
          this.travelSync.getRelatedDevices(DeviceSync.FORWARDS));
      case DeviceSync.DOWN:
        return union(this.travelSync.getRelatedDevices(DeviceSync.DOWN),
          this.travelSync.getRelatedDevices(DeviceSync.BACKWARDS));
      default:
        return this.travelSync.getRelatedDevices(direction);
      }
    },

    interpretCastVector: function(v, spec) {
      var self = this;

      var direction = getGestureDirection(v);
      if (direction) {
        var related = this.getRelatedDevices(direction);
        if (related.size === 1) {
          // Use forEach for singleton multimap entry extraction.
          related.forEach(function(deviceName, owner) {
            self.cast(owner, deviceName, spec).catch(self.onError);
          });
        } else {
          var unknown = this.travelSync.getUnconnectedCastTargets();

          if (related.size === 0 && unknown.size === 1) {
            // Use forEach for singleton multimap entry extraction.
            unknown.forEach(function(deviceName, owner) {
              Promise.all([
                self.cast(owner, deviceName, spec),
                self.travelSync.relateDevice(owner, deviceName, {
                  direction: direction,
                  magnitude: DeviceSync.NEAR
                })
              ]).catch(self.onError);
            });
          } else {
            var all = this.travelSync.getPossibleCastTargets();
            var other = difference(all, related);

            if (related.size > 0 || unknown.size > 0 || other.size > 0) {
              this.onAmbiguousCast(related, unknown, other);
            } else {
              this.onNoNearbyDevices();
            }
          }
        }
      }
    },

    cast: function(targetOwner, targetDeviceName, spec) {
      var self = this;

      return this.travelSync.cast(targetOwner, targetDeviceName, spec)
        .then(function() {
          self.onSendCast(targetOwner, targetDeviceName, spec);
        }, this.onError);
    }
  },

  events: {
    /**
     * @param targetOwner target device owner
     * @param targetDeviceName target device name
     * @param spec the cast spec, as given to makeCastable's opts.
     */
    onSendCast: '',
    /**
     * @param related owner => device multimap of related cast candidates
     * @param unknown owner => device multimap of unconnected cast candidates
     * @param other owner => device multimap of unrelated connected cast
     *  candidates
     */
    onAmbiguousCast: '',
    /**
     * Triggered when a cast is attempted but there are no known nearby devices.
     */
    onNoNearbyDevices: '',
    onError: 'memory'
  },

  init: function(travelSync, domRoot) {
    this.travelSync = travelSync;
  }
});

module.exports = CastingManager;