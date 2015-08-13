// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('./util/jquery');
var raf = require('raf');
var defineClass = require('./util/define-class');

var AddButton = require('./components/add-button');
var DestinationSearch = require('./components/destination-search');
var Identity = require('./identity');
var Map = require('./components/map');
var Messages = require('./components/messages');
var Message = require('./components/message');
var Timeline = require('./components/timeline');
var TravelSync = require('./travelsync');

var vanadiumWrapperDefault = require('./vanadium-wrapper');

var strings = require('./strings').currentLocale;
var describeDestination = require('./describe-destination');

function bindControlToDestination(control, destination) {
  function updateOrdinal() {
    handleDestinationOrdinalUpdate(control, destination);
  }

  if (destination) {
    destination.onPlaceChange.add(control.setPlace);
    destination.onSelect.add(control.select);
    destination.onDeselect.add(control.deselect);
    destination.onOrdinalChange.add(updateOrdinal);
    control.setPlace(destination.getPlace());
    /* Since these controls are 1:1 with destinations, we don't want to stay in
     * a state where the control has invalid text but the destination is still
     * valid; that would be confusing to the user (e.g. abandoned query string
     * "restaurants" for destination 4 Privet Drive.) */
    control.onPlaceChange.add(destination.setPlace);
  }

  updateOrdinal();

  if (destination && destination.isSelected()) {
    control.select();
  } else {
    control.deselect();
  }

  return destination? function unbind() {
    destination.onPlaceChange.remove(control.setPlace);
    destination.onSelect.remove(control.select);
    destination.onDeselect.remove(control.deselect);
    destination.onOrdinalChange.remove(updateOrdinal);
    control.onPlaceChange.remove(destination.setPlace);
  } : $.noop;
}

function buildStatusErrorStringMap(statusClass, stringGroup) {
  var dict = {};
  $.each(statusClass, function(name, value) {
    dict[value] = stringGroup[name];
  });
  return dict;
}

function handleDestinationOrdinalUpdate(control, destination) {
  control.setPlaceholder(describeDestination.descriptionOpenEnded(destination));
}

var Travel = defineClass({
  publics: {
    addDestination: function() {
      var map = this.map;

      var destination = map.addDestination();
      var control = this.timeline.append();

      bindControlToDestination(control, destination);

      control.setSearchBounds(map.getBounds());
      map.onBoundsChange.add(control.setSearchBounds);

      control.onFocus.add(function() {
        if (!destination.isSelected()) {
          map.closeActiveInfoWindow();
          destination.select();
        }
      });

      control.onSearch.add(function(results) {
        /* There seems to be a bug where if you click a search suggestion (for
         * a query, not a resolved location) in autocomplete, the input box
         * under it gets clicked and focused... I haven't been able to figure
         * out why. */
        control.focus();

        map.showSearchResults(results);
      });

      this.timeline.disableAdd();
      var oldLast = this.timeline.get(-2);
      if (oldLast) {
        this.unbindLastDestinationSearchEvents(oldLast);
      }
      this.bindLastDestinationSearchEvents(control);

      this.bindMiniFeedback(destination);

      return {
        destination: destination,
        control: control
      };
    },

    error: function (err) {
      this.messages.push(Message.error(err));
    },

    info: function (info, promise) {
      var messageData = Message.info(info);
      messageData.promise = promise;
      this.messages.push(messageData);
    }
  },

  privates: {
    /**
     * Handles destination addition via the mini-UI.
     */
    addDestinationMini: function() {
      this.miniDestinationSearch.clear();
      this.map.closeActiveInfoWindow();

      var destination = this.addDestination().destination;
      destination.select();
      this.miniDestinationSearch.focus();
      this.miniDestinationSearch.setPlaceholder(strings['Add destination']);
    },

    bindMiniFeedback: function(destination) {
      var mf = this.miniFeedback;

      destination.onSelect.add(mf.handleSelect);
      destination.onDeselect.add(mf.handleDeselect);
    },

    initMiniFeedback: function() {
      var self = this;

      //context: destination
      function handlePlaceChange(place) {
        self.miniDestinationSearch.setPlace(place);
        self.miniDestinationSearch.setPlaceholder(
          strings.change(describeDestination.description(this)));
      }

      //context: destination.
      function handleSelect() {
        handlePlaceChange.call(this, this.getPlace());
        this.onPlaceChange.add(handlePlaceChange);
      }

      function handleDeselect() {
        this.onPlaceChange.remove(handlePlaceChange);
        if (self.miniDestinationSearch.getPlace()) {
          self.miniDestinationSearch.clear();
        }
        self.miniDestinationSearch.setPlaceholder(strings['Search']);
      }

      this.miniFeedback = {
        handleSelect: handleSelect,
        handleDeselect: handleDeselect,
        handlePlaceChange: handlePlaceChange
      };
    },

    showTimeline: function() {
      if (this.$timelineContainer.hasClass('collapsed')) {
        this.$toggleTimeline.removeClass('collapsed');
        this.$timelineContainer.removeClass('collapsed');
        this.$minPanel.addClass('collapsed');
        //disable the control, but wait until offscreen to avoid distraction
        this.$minPanel.one('transitionend', this.miniDestinationSearch.disable);
        this.watchMapResizes();
      }
    },

    collapseTimeline: function() {
      if (!this.$timelineContainer.hasClass('collapsed')) {
        this.$toggleTimeline.addClass('collapsed');
        this.$timelineContainer.addClass('collapsed');
        this.$minPanel.removeClass('collapsed');
        this.miniDestinationSearch.enable();
        if (!this.miniDestinationSearch.getPlace()) {
          this.miniDestinationSearch.focus();
        }
        this.watchMapResizes();
      }
    },

    bindLastDestinationSearchEvents: function(control) {
      control.onPlaceChange.add(this.handleLastPlaceChange);
      control.onDeselect.add(this.handleLastPlaceDeselected);
    },

    unbindLastDestinationSearchEvents: function(control) {
      control.onPlaceChange.remove(this.handleLastPlaceChange);
      control.onDeselect.remove(this.handleLastPlaceDeselected);
    },

    handleLastPlaceChange: function(place) {
      if (place) {
        this.timeline.enableAdd();
      } else {
        this.timeline.disableAdd();
      }
    },

    handleLastPlaceDeselected: function() {
      var self = this;
      /* Wait until next frame to allow selection/focus to update; we don't want
       * to remove a box that has just received focus. */
      raf(function() {
        var lastControl = self.timeline.get(-1);
        var oldLast = lastControl;

        while (!lastControl.getPlace() && !lastControl.isSelected() &&
            self.timeline.get().length > 1) {
          self.timeline.remove(-1);
          self.map.removeDestination(-1);
          lastControl = self.timeline.get(-1);
        }

        if (oldLast !== lastControl) {
          self.bindLastDestinationSearchEvents(lastControl);
          self.handleLastPlaceChange(lastControl.getPlace());
        }
      });
    },

    /**
     * The map widget isn't very sensitive to size updates, so we need to
     * continuously invalidate during animations.
     */
    watchMapResizes: function() {
      var newWidth = this.map.$.width();
      if (newWidth !== this.mapWidth) {
        this.widthStable = 0;

        this.mapWidth = newWidth;
        this.map.invalidateSize();
        raf(this.watchMapResizes);

      } else if (this.widthStable < 5) {
        raf(this.watchMapResizes);
        this.widthStable++;
      } else {
        this.mapWidth = null;
      }
    }
  },

  init: function (opts) {
    var self = this;

    opts = opts || {};
    var vanadiumWrapper = opts.vanadiumWrapper || vanadiumWrapperDefault;

    var map = this.map = new Map(opts);
    var maps = map.maps;

    var messages = this.messages = new Messages();
    var timeline = this.timeline = new Timeline(maps);

    var sync = this.sync = new TravelSync();

    var error = this.error;

    this.info(strings['Connecting...'], vanadiumWrapper.init(opts.vanadium)
      .then(function(wrapper) {
        wrapper.onCrash.add(error);

        var identity = new Identity(wrapper.getAccountName());
        identity.mountName = makeMountName(identity);
        return sync.start(identity.mountName, wrapper);
      }).then(function() {
        return strings['Connected to all services.'];
      }));

    var directionsServiceStatusStrings = buildStatusErrorStringMap(
      maps.DirectionsStatus, strings.DirectionsStatus);

    map.onError.add(function(err) {
      var message = directionsServiceStatusStrings[err.directionsStatus] ||
        strings['Unknown error'];

      error(message);
    });

    timeline.onAddClick.add(function() {
      self.addDestination().control.focus();
    });

    var miniAddButton = this.miniAddButton = new AddButton();
    var miniDestinationSearch = this.miniDestinationSearch =
      new DestinationSearch(maps);

    miniAddButton.onClick.add(this.addDestinationMini);

    miniDestinationSearch.setPlaceholder(strings['Search']);
    miniDestinationSearch.setSearchBounds(map.getBounds());
    map.onBoundsChange.add(miniDestinationSearch.setSearchBounds);

    miniDestinationSearch.onSearch.add(function(results) {
      if (results.length > 0) {
        /* If we've searched for a location via the minibox, any subsequent
         * map click is probably intended to deselect the destination rather
         * than pick by clicking. This differs from the timeline behavior since
         * when we invalidate a timeline location, we delete the destination
         * place and so must pick a new one. */
        map.disableLocationSelection();
      }
      map.showSearchResults(results);
    });

    miniDestinationSearch.onPlaceChange.add(function(place) {
      if (!place) {
        self.map.enableLocationSelection();
      }
    });

    var $miniPanel = this.$minPanel = $('<div>')
      .addClass('mini-search')
      .append(miniAddButton.$,
              miniDestinationSearch.$);

    /* This container lets us collapse the destination panel even though it has
     * padding, without resorting to transform: scaleX which would
     * unnecessarily distort the text (which is an effect that is nice for the
     * add button, so that gets it explicitly). */
    var $timelineContainer = this.$timelineContainer = $('<div>')
      .addClass('timeline-container collapsed')
      .append(timeline.$);

    var $toggleTimeline = this.$toggleTimeline = $('<div>')
      .addClass('toggle-timeline no-select collapsed')
      .text(strings['Timeline'])
      .mouseenter(this.showTimeline)
      .click(this.collapseTimeline);

    map.addControls(maps.ControlPosition.TOP_CENTER, messages.$);
    map.addControls(maps.ControlPosition.LEFT_TOP, $miniPanel);
    map.addControls(maps.ControlPosition.LEFT_CENTER, $toggleTimeline);

    var $domRoot = opts.domRoot? $(opts.domRoot) : $('body');

    $domRoot.append($timelineContainer, map.$);

    this.initMiniFeedback();

    this.addDestination();
    miniDestinationSearch.focus();
  }
});

function makeMountName(id) {
  // TODO: first-class app-wide rather than siloed by account
  return 'users/' + id.username + '/travel/' + id.deviceName;
}

module.exports = Travel;
