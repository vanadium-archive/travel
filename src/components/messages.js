var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var message = require('./message');

var Messages = defineClass({
  publics: {
    push: function(messageData) {
      var messageObject = new message.Message(messageData);
      /*
       * Implementation notes: slideDown won't work properly (won't be able to
       * calculate goal height) unless the element is in the DOM tree prior
       * to the call, so we hide first, attach, and then animate. slideDown
       * implicitly shows the element.
       *
       * Similarly, we use animate rather than fadeIn because fadeIn implicitly
       * hides the element upon completion, resulting in an abrupt void in the
       * element flow. Instead, we want to keep the element taking up space
       * while invisible until we've collapsed the height via slideUp.
       */
      messageObject.$.hide();
      this.$.append(messageObject.$);
      messageObject.$
        .slideDown(Messages.slideDown)
        .delay(Messages.ttl)
        .animate({ opacity: 0 }, Messages.fade)
        .slideUp(Messages.slideUp, function() {
          messageObject.$.remove();
        });
    }
  },

  constants: ['$'],

  init: function() {
    this.$ = $('<ul>').addClass('messages');
  }
});

Messages.slideDown = 150;
Messages.ttl = 9000;
Messages.fade = 1000;
Messages.slideUp = 300;

module.exports = Messages;