// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var message = require('./message');

var Messages = defineClass({
  statics: {
    SLIDE_DOWN: 150,
    TTL: 9000,
    FADE: 1000,
    SLIDE_UP: 300,
    OPEN_CLOSE: 500
  },

  publics: {
    close: function() {
      var self = this;

      if (this.isOpen()) {
        if (this.$messages.children().length) {
          var scrollOffset =
            this.$messages.scrollTop() + self.$messages.height();

          this.$messages
            .addClass('animating')
            .animate({ height: 0 }, {
              duration: this.OPEN_CLOSE,
              progress: function() {
                self.$messages.scrollTop(
                  scrollOffset - self.$messages.height());
              },
              complete: function() {
                self.$messages.removeClass('animating');
                self.$.addClass('headlines');
                self.$messages.attr('style', null);
              }
            });
        } else {
          this.$.addClass('headlines');
        }
      }
    },

    isClosed: function() {
      return this.$.hasClass('headlines') &&
        !this.$messages.hasClass('animating');
    },

    isOpen: function() {
      return !this.$.hasClass('headlines') &&
        !this.$messages.hasClass('animating');
    },

    open: function() {
      var self = this;

      if (!this.isOpen()) {
        var $animating = this.$.find('.animating');
        $animating.stop(true);
        $animating.removeClass('animating');
        $animating.attr('style', null);

        this.$.removeClass('headlines');
        if (this.$messages.children().length) {
          var goalHeight = this.$messages.height();
          this.$messages
            .addClass('animating')
            .height(0)
            .animate({ height: goalHeight }, {
              duration: this.OPEN_CLOSE,
              progress: function() {
                self.$messages.scrollTop(self.$messages.prop('scrollHeight'));
              },
              complete: function() {
                self.$messages.removeClass('animating');
                self.$messages.attr('style', null);
              }
            });
        }
      }
    },

    push: function(messageData) {
      var messageObject = new message.Message(messageData);
      this.$messages.append(messageObject.$);

      if (this.isOpen()) {
        this.$messages.scrollTop(this.$messages.prop('scrollHeight'));
      } else {
        /*
         * Implementation notes: slideDown won't work properly (won't be able to
         * calculate goal height) unless the element is in the DOM tree prior
         * to the call, so we hide first, attach, and then animate. slideDown
         * implicitly shows the element. Furthermore, it won't run unless the
         * element starts hidden.
         *
         * Similarly, we use animate rather than fadeIn because fadeIn
         * implicitly hides the element upon completion, resulting in an abrupt
         * void in the element flow. Instead, we want to keep the element taking
         * up space while invisible until we've collapsed the height via
         * slideUp.
         *
         * It would be best to use CSS animations, but at this time that would
         * mean sacrificing either auto-height or flow-affecting sliding.
         */
        messageObject.$.addClass('animating');
        messageObject.$
          .slideDown(this.SLIDE_DOWN)
          .delay(this.TTL)
          .animate({ opacity: 0 }, this.FADE)
          .slideUp(this.SLIDE_UP, function() {
            messageObject.$
              .removeClass('animating')
              .attr('style', null);
          });
      }
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

  constants: ['$'],

  init: function() {
    this.$handle = $('<div>')
      .addClass('handle')
      .click(this.toggle.bind(this));

    this.$messages = $('<ul>');

    this.$ = $('<div>')
      .addClass('messages')
      .addClass('headlines')
      .append(this.$handle)
      .append(this.$messages);
  }
});

module.exports = Messages;