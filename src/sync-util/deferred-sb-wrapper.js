// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var defineClass = require('../util/define-class');

var DeferredSbWrapper = defineClass({
  publics: {
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
    }
  },

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

  init: function(sbPromise) {
    var self = this;

    this.writes = new Set();
    this.sbPromise = sbPromise;

    sbPromise.then(function(syncbase) {
      syncbase.onError.add(self.onError);
      syncbase.onUpdate.add(self.processUpdates);
    }).catch(this.onError);
  }
});

module.exports = DeferredSbWrapper;