// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var uuid = require('uuid');

var marshalling = require('./marshalling');

var MessageSync = defineClass({
  publics: {
    message: function(messageContent) {
      var id = uuid.v4();
      var payload = $.extend({
        timestamp: Date.now()
      }, messageContent);
      var value = marshalling.marshal(payload);

      this.sbw.put(this.tripManager.getMessagesKey(id), value);
    },

    processMessages: function(messageData) {
      var self = this;

      if (messageData) {
        /* Dispatch new messages in time order, though don't put them before
         * local messages. */
        var newMessages = [];
        $.each(messageData, function(id, serializedMessage) {
          if (!self.messages[id]) {
            var message = marshalling.unmarshal(serializedMessage);
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
    }
  },

  events: [ 'onMessages' ],

  init: function(deferredSyncbaseWrapper, tripManager) {
    this.sbw = deferredSyncbaseWrapper;
    this.tripManager = tripManager;

    this.messages = {};
  }
});

module.exports = MessageSync;