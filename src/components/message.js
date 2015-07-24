var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var INFO = 'INFO';
var ERROR = 'ERROR';

module.exports = {
  INFO: INFO,
  ERROR: ERROR,
  
  info: function(text) {
    return {
      type: INFO,
      text: text
    };
  },
  
  error: function(text) {
    return {
      type: ERROR,
      text: text
    };
  },
  
  Message: defineClass({
    publics: {
      setType: function(type) {
        if (type == INFO) {
          this.$.attr('class', 'info');
        } else if (type == ERROR) {
          this.$.attr('class', 'error');
        } else {
          throw 'Invalid message type ' + type;
        }
      },
      
      setText: function(text) {
        this.$.text(text);
      },
      
      set: function(message) {
        this.setType(message.type);
        this.setText(message.text);
      }
    },
    
    constants: ['$'],
    
    init: function(initial) {
      this.$ = $('<li>');
      if (initial)
        this.set(initial);
    }
  })
};
