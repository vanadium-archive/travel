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

    add: function(i) {
      var controls = this.controls;

      var destinationSearch = new DestinationSearch(this.maps);
      if (i === undefined || i === controls.length) {
        this.$destContainer.append(destinationSearch.$);
        controls.push(destinationSearch);
      } else {
        destinationSearch.$.insertBefore(this.$destContainer.children()[i]);
        controls.splice(i, 0, destinationSearch);
      }

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
      var removed;
      if (i >= 0) {
        removed = this.controls.splice(i, 1)[0];
      } else if (i < 0) {
        removed = this.controls.splice(this.controls.length + i, 1)[0];
      }

      if (removed) {
        removed.$.remove();
      }
      return removed;
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