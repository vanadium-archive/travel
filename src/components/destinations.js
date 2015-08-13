// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var DestinationControl = require('./destination-control');

var Destinations = defineClass({
  publics: {
    append: function() {
      var controls = this.controls;

      var destinationControl = new DestinationControl(this.maps);
      this.$destContainer.append(destinationControl.$);
      controls.push(destinationControl);

      return destinationControl;
    }
  },

  constants: [ '$' ],
  events: [ 'onAddClick' ],

  init: function(maps) {
    var self = this;

    this.maps = maps;
    this.$ = $('<form>').addClass('destinations');
    this.$destContainer = $('<div>');
    this.$.append(this.$destContainer);

    $('<div>')
      .addClass('add-bn')
      .text('+')
      .click(function() {
        self.onAddClick();
      })
      .appendTo(this.$);

    this.controls = [];
  }
});

module.exports = Destinations;