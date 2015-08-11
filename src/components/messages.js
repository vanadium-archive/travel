// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var Message = require('./message');

var VK_ENTER = 13;
var VK_ESCAPE = 27;

var Messages = defineClass({
  statics: {
    SLIDE_DOWN: 150,
    TTL: 9000,
    FADE: 1000,
    SLIDE_UP: 300,
    OPEN_CLOSE: 400,

    OLD: 30000
  },

  publics: {
    close: function() {
      var self = this;
      var $messages = this.$messages;

      if (this.isOpen()) {
        if ($messages.children().length) {
          var scrollOffset =
            $messages.scrollTop() + $messages.height();

          this.$messages
            .addClass('animating')
            .animate({ height: 0 }, {
              duration: this.OPEN_CLOSE,
              progress: function() {
                $messages.scrollTop(
                  scrollOffset - $messages.height());
              },
              complete: function() {
                $messages.removeClass('animating');
                self.$.addClass('headlines');
                $messages.attr('style', null);
              }
            });
        } else {
          this.$.addClass('headlines');
        }
      }
    },

    isClosed: function() {
      return this.$.hasClass('headlines');
    },

    isOpen: function() {
      return !this.$.hasClass('headlines') &&
        !this.$messages.hasClass('animating');
    },

    open: function() {
      var $messages = this.$messages;

      if (this.isClosed()) {
        this.$.find('.animating')
          .stop(true)
          .removeClass('animating')
          .attr('style', null);

        this.$.removeClass('headlines');
        if ($messages.children().length) {
          var goalHeight = $messages.height();
          $messages
            .addClass('animating')
            .height(0)
            .animate({ height: goalHeight }, {
              duration: this.OPEN_CLOSE,
              progress: function() {
                $messages.scrollTop($messages.prop('scrollHeight'));
              },
              complete: function() {
                $messages.removeClass('animating');
                $messages.attr('style', null);
              }
            });
        }
      }
      this.focus();
    },

    focus: function() {
      this.$content.focus();
    },

    push: function(message) {
      var self = this;
      $.each(arguments, function() {
        self.pushOne(this);
      });
    },

    setUsername: function(username) {
      this.username = username;
      this.$username.text(username);
    },

    toggle: function() {
      /* If this were pure CSS, we could just toggle, but we need to do some
       * JS housekeeping. */
      if (this.isOpen()) {
        this.close();
      } else if (this.isClosed()) {
        this.open();
      }
    }
  },

  privates: {
    inputKey: function(e) {
      switch (e.which) {
        case VK_ENTER: {
          var raw = this.$content.prop('value');
          if (raw) {
            var message = Message.info(raw);
            message.sender = this.username;
            this.$content.prop('value', '');
            this.onMessage(message, raw);
          }
          break;
        }
        case VK_ESCAPE: {
          this.close();
        }
      }
    },

    pushOne: function(message) {
      var self = this;

      if ($.isPlainObject(message)) {
        message = new Message(message);
      }

      this.$messages.append(message.$);

      var timestamp = message.getTimestamp();
      var isOld = timestamp !== undefined && timestamp !== null &&
        Date.now() - timestamp >= Messages.OLD;

      if (this.isOpen()) {
        this.$messages.scrollTop(this.$messages.prop('scrollHeight'));
      }

      if (isOld) {
        message.$.addClass('history');
      } else {
        if (!this.isOpen()) {
          /*
           * Implementation notes: slideDown won't work properly (won't be able
           * to calculate goal height) unless the element is in the DOM tree
           * prior to the call, so we hide first, attach, and then animate.
           * slideDown implicitly shows the element. Furthermore, it won't run
           * unless the element starts hidden.
           *
           * Similarly, we use animate rather than fadeIn because fadeIn
           * implicitly hides the element upon completion, resulting in an
           * abrupt void in the element flow. Instead, we want to keep the
           * element taking up space while invisible until we've collapsed the
           * height via slideUp.
           *
           * It would be best to use CSS animations, but at this time that would
           * mean sacrificing either auto-height or flow-affecting sliding.
           */
          message.$
            .addClass('animating')
            .hide()
            .slideDown(this.SLIDE_DOWN);
        }

        message.onLowerPriority.add(function() {
          message.$.addClass('history');

          if (self.isClosed()) {
            message.$
              .addClass('animating')
              .show()
              .delay(Messages.TTL)
              .animate({ opacity: 0 }, Messages.FADE)
              .slideUp(Messages.SLIDE_UP, function() {
                message.$
                  .removeClass('animating')
                  .attr('style', null);
              });
          }
        });
      }
    }
  },

  constants: ['$'],
  /**
   * @param message the message object that should be sent.
   * @param raw the raw text input.
   */
  events: [ 'onMessage' ],

  init: function() {
    var $handle = $('<div>')
      .addClass('handle no-select')
      .click(this.toggle);

    this.$messages = $('<ul>');

    var $send = $('<div>')
      .addClass('send')
      .append(this.$username = $('<div>')
                .addClass('username label'),
              $('<div>').append(
                this.$content = $('<input>')
                  .attr('type', 'text')
                  .keydown(this.inputKey)));

    this.$ = $('<div>')
      .addClass('messages headlines')
      .append($handle, this.$messages, $send);
  }
});

module.exports = Messages;