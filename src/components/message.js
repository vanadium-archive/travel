// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var Message = defineClass({
  statics: {
    INFO: 'INFO',
    ERROR: 'ERROR',

    info: function(text) {
      return {
        type: Message.INFO,
        text: text
      };
    },

    error: function(err) {
      if (typeof err !== 'string') {
        console.error(err);
      }

      while (err.message) {
        err = err.message; //ExtensionCrashError.message.message = ...
      }

      return {
        type: Message.ERROR,
        text: err.msg || err.toString()
      };
    }
  },

  publics: {
    setType: function(type) {
      switch (type) {
        case Message.INFO:
          this.$.attr('class', 'info');
          break;
        case Message.ERROR:
          this.$.attr('class', 'error');
          break;
        default:
          throw 'Invalid message type ' + type;
      }
    },

    setText: function(text) {
      this.$.text(text);
    },

    set: function(message) {
      if (!message) {
        this.onLowerPriority();
        return;
      }

      if (typeof message === 'string') {
        message = Message.info(message);
      }

      var self = this;

      this.setType(message.type);
      this.setText(message.text);

      if (message.promise) {
        message.promise.then(function(message) {
          self.set(message);
        }, function(err) {
          self.set(Message.error(err));
        });
      } else {
        this.onLowerPriority();
      }
    }
  },

  constants: [ '$' ],
  events: {
    /**
     * Event raised when the message is no longer pending user action.
     */
    onLowerPriority: 'memory once'
  },

  init: function(initial) {
    this.$ = $('<li>');
    if (initial) {
      this.set(initial);
    }
  }
});

module.exports = Message;
