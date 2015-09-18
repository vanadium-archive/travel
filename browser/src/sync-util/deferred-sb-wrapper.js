// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');
var SyncbaseWrapper = require('../vanadium-wrapper/syncbase-wrapper');

var defs = {};

$.each(SyncbaseWrapper.ifc, function(method) {
  defs[method] = function() {
    var args = arguments;
    return this.sbPromise.then(function(sb) {
      return sb[method].apply(sb, args);
    });
  };
});

var DeferredSbWrapper = defineClass({
  // TODO(rosswang): extend = transitional
  publics: $.extend(defs, {
    batch: function(fn) {
      this.manageWrite(this.sbPromise.then(function(syncbase) {
        return syncbase.batch(fn);
      }).catch(this.onError));
    },

    nonBatched: function(fn) {
      this.manageWrite(this.sbPromise.then(function(syncbase) {
        return fn.call(syncbase, syncbase);
      }).catch(this.onError));
    },

    put: function(key, value) {
      this.sbPromise.then(function(syncbase) {
        return syncbase.put(key, value);
      }).catch(this.onError);
    },

    getData: function() {
      return this.sbPromise.then(function(syncbase) {
        return syncbase.getData();
      });
    },

    pull: function(prefix) {
      return this.sbPromise.then(function(syncbase) {
        return syncbase.pull(prefix);
      });
    }
  }),

  // TODO(rosswang): transitional
  privates: {
    manageWrite: function(promise) {
      var writes = this.writes;
      writes.add(promise);
      promise.then(function() {
        writes.delete(promise);
      }, function() {
        writes.delete(promise);
      });
    },

    processUpdates: function(data) {
      /* Although SyncbaseWrapper gates on something similar, we may block on
       * SyncBase initialization and don't want initial pulls overwriting local
       * updates queued for writing. We could actually do it here only, but
       * having it in SyncbaseWrapper as well is semantically correct. */
      if (!this.writes.size) {
        this.onUpdate(data);
      }
    }
  },

  events: {
    onError: 'memory',
    onUpdate: ''
  },
  // TODO(rosswang): end transitional

  init: function(sbPromise) {
    this.sbPromise = sbPromise;

    // TODO(rosswang): transitional
    var self = this;

    this.writes = new Set();

    sbPromise.then(function(syncbase) {
      syncbase.onError.add(self.onError);
      syncbase.onUpdate.add(self.processUpdates);
    }).catch(this.onError);
    // TODO(rosswang): end transitional
  }
});

module.exports = DeferredSbWrapper;
