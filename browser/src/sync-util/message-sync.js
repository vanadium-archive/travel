// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var uuid = require('uuid');

var marshalling = require('./marshalling');

function cmp(a, b) {
  return a.timestamp - b.timestamp;
}

var MessageSync = defineClass({
  publics: {
    message: function(messageContent) {
      var id = uuid.v4();
      var payload = $.extend({
        timestamp: Date.now()
      }, messageContent);
      var value = marshalling.marshal(payload);

      this.sbw.put(this.tripManager.getMessagesKey(id), value);
    }
  },

  privates: {
    processMessage: function(k, v) {
      var id = k[k.length - 1];
      if (!this.messageIds.has(id)) {
        this.messageIds.add(id);
        this.messageBatch.push(marshalling.unmarshal(v));
      }
    },

    endBatch: function() {
      this.messageBatch.sort(cmp);
      this.onMessages(this.messageBatch);
      this.messageBatch = [];
    },

    setPrefix: function(prefix) {
      var self = this;

      return this.sbw.getRawWatched(prefix, {
        onData: this.processMessage,
        onError: this.onError
      }, {
        onPut: this.processMessage,
        onBatchEnd: this.endBatch,
        onError: this.onError,
        onClose: function(err) {
          if (err) {
            self.onError(err);
          }
        }
      }).then(this.endBatch, this.onError);
    },

    refresh: function() {
      return this.setPrefix(this.tripManager.getMessagesKey());
    }
  },

  events: {
    onMessages: '',
    onError: 'memory'
  },

  init: function(deferredSyncbaseWrapper, tripManager) {
    this.sbw = deferredSyncbaseWrapper;
    this.tripManager = tripManager;

    this.messageIds = new Set();
    this.messageBatch = [];

    tripManager.onTripChange.add(this.refresh);
  }
});

module.exports = MessageSync;