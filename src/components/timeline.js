// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var AddButton = require('./add-button');
var DestinationSearch = require('./destination-search');

var Timeline = defineClass({
  publics: {
    disableAdd: function() {
      this.addButton.disable();
    },

    enableAdd: function() {
      this.addButton.enable();
    },

    append: function() {
      var controls = this.controls;

      var destinationSearch = new DestinationSearch(this.maps);
      this.$destContainer.append(destinationSearch.$);
      controls.push(destinationSearch);

      return destinationSearch;
    },

    get: function(i) {
      if (i === undefined) {
        return this.controls.slice(0);
      } else if (i >= 0) {
        return this.controls[i];
      } else if (i < 0) {
        return this.controls[this.controls.length + i];
      }
    },

    remove: function(i) {
      if (i >= 0) {
        this.controls.splice(i, 1)[0].$.remove();
      } else if (i < 0) {
        this.controls.splice(this.controls.length + i, 1)[0].$.remove();
      }
    }
  },

  constants: [ '$' ],
  events: [ 'onAddClick' ],

  init: function(maps) {
    this.maps = maps;

    this.addButton = new AddButton();
    this.addButton.onClick.add(this.onAddClick);

    this.$ = $('<form>')
      .addClass('timeline no-select')
      .append(this.$destContainer = $('<div>'), //for easier appending
              this.addButton.$,
              //get the scroll region to include the add button
              $('<div>')
                .addClass('clear-float'));

    this.controls = [];
  }
});

module.exports = Timeline;