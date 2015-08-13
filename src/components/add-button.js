// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var AddButton = defineClass({
  publics: {
    disable: function() {
      this.$.addClass('disabled');
    },

    enable: function() {
      this.$.removeClass('disabled');
    },

    isEnabled: function() {
      return !this.$.hasClass('disabled');
    }
  },

  constants: [ '$' ],
  events: [ 'onClick' ],

  init: function(maps) {
    var self = this;

    this.$ = $('<div>')
      .addClass('add-bn')
      .click(function() {
        if (self.isEnabled()) {
          self.onClick();
        }
      })
      .append($('<div>')
        .addClass('vertical-middle')
        .text('+'));
  }
});

module.exports = AddButton;