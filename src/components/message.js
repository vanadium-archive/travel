// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var format = require('date-format');

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
      this.$text.text(text);
    },

    setTimestamp: function(timestamp) {
      var fmt;
      if (timestamp === null || timestamp === undefined) {
        fmt = '';
      } else {
        fmt = format('yyyy.MM.dd.hh.mm.ss', new Date(timestamp));
      }
      this.$timestamp.text(fmt);
      if (fmt) {
        this.$label.removeClass('no-timestamp');
      } else {
        this.$label.addClass('no-timestamp');
      }
    },

    setSender: function(sender) {
      this.$sender.text(sender);
      if (sender) {
        this.$label.removeClass('no-sender');
      } else {
        this.$label.addClass('no-sender');
      }
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
      this.setSender(message.sender);
      this.setTimestamp(message.timestamp);
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
    this.$ = $('<li>')
      .append(
        this.$label = $('<span>').addClass('label').append(
          this.$sender = $('<span>').addClass('username'),
          this.$timestamp = $('<span>').addClass('timestamp')),
        this.$text = $('<span>').addClass('text'));
    if (initial) {
      this.set(initial);
    }
  }
});

module.exports = Message;
