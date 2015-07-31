// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

//TODO(rosswang): either expect ES6, use our own polyfill, or export this in V23
var Promise = require('vanadium/src/lib/promise');

var $ = require('./util/jquery');
var defineClass = require('./util/define-class');

var vdlTravel = require('../ifc');

var TravelSync = defineClass({
  publics: {
    start: function(mountName, v) {
      var self = this;
      var startSyncbase = v.syncbase('/localhost:4001/syncbase').then(
        function(syncbase) {
          self.syncbase = syncbase;
          syncbase.onError.add(self.onError);
          syncbase.onUpdate.add(self.processUpdates.bind(self));
        });

      return Promise.all([
        v.server(mountName, this.server),
        startSyncbase
      ]);
    },

    message: function(messageContent) {

    },

    pushTrip: function() {
    },

    pushStatus: function() {
    }
  },

  privates: {
    marshal: function(x) {
      return JSON.stringify(x);
    },

    unmarshal: function(x) {
      return JSON.parse(x);
    },

    processUpdates: function(data) {
      var self = this;
      if (data.messages) {
        /* Dispatch new messages in time order, though don't put them before
         * local messages. */
        var newMessages = [];
        $.each(data.messages, function(id, serializedMessage) {
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

        self.onMessages(newMessages);
      }
    }
  },

  events: {
    onError: 'memory',
    /**
     * @param messages array of {content, timestamp} pair objects.
     */
    onMessages: '',
    onPlanUpdate: '',
    onStatusUpdate: ''
  },

  init: function() {
    this.tripPlan = [];
    this.tripStatus = {};
    this.messages = {};

    this.server = new vdlTravel.TravelSync();

    var travelSync = this;
    this.server.get = function(ctx, serverCall) {
      return {
        Plan: travelSync.tripPlan,
        Status: travelSync.tripStatus
      };
    };

    this.server.updatePlan = function(ctx, serverCall, plan, message) {
      travelSync.tripPlan = plan;
      travelSync.onPlanUpdate(plan);
      travelSync.onMessage(message);
    };

    this.server.updateStatus = function(ctx, serverCall, status) {
      travelSync.tripStatus = status;
      travelSync.onStatusUpdate(status);
    };
  }
});

module.exports = TravelSync;
