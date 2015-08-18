// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var queryString = require('query-string');
var raf = require('raf');

var $ = require('./util/jquery');
var defineClass = require('./util/define-class');

var AddButton = require('./components/add-button');
var DestinationSearch = require('./components/destination-search');
var MapWidget = require('./components/map-widget');
var Messages = require('./components/messages');
var Message = require('./components/message');
var Timeline = require('./components/timeline');

var Destinations = require('./destinations');
var Identity = require('./identity');
var TravelSync = require('./travelsync');

var vanadiumWrapperDefault = require('./vanadium-wrapper');

var debug = require('./debug');
var describeDestination = require('./describe-destination');
var naming = require('./naming');
var strings = require('./strings').currentLocale;

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

var CMD_REGEX = /\/(\S*)(?:\s+(.*))?/;

var Travel = defineClass({
  publics: {
    dump: function() {
      this.sync.getData().then(function(data) {
        debug.log(data);
      }, function(err) {
        console.error(err);
      });
    },

    error: function (err) {
      this.messages.push(Message.error(err));
    },

    info: function (info, promise) {
      this.messages.push(new Message({
        type: Message.INFO,
        text: info,
        promise: promise
      }));
    },

    invite: function(recipient) {
      var self = this;

      var owner = this.sync.getActiveTripOwner();
      if (owner) {
        this.info(strings.sendingInvite(recipient),
          this.sync.invitationManager.invite(recipient,
              this.sync.getActiveTripOwner(), this.sync.getActiveTripId())
            .then(function() {
              var me = self.sync.invitationManager.getUsername();
              self.sync.message({
                type: Message.INFO,
                text: strings.invitationSent(recipient, me)
              });
            }, function(err) {
              if (err.id === 'v.io/v23/verror.NoServers') {
                throw strings.notReachable(recipient);
              } else {
                throw err;
              }
            }));
      } else {
        this.error(strings['Trip is still initializing.']);
      }
    }
  },

  privates: {
    handleDestinationAdd: function(destination) {
      var map = this.map;

      var control = this.timeline.add(destination.getIndex());
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

      if (!destination.hasNext()) {
        this.timeline.disableAdd();
        var oldLast = this.timeline.get(-2);
        if (oldLast) {
          this.unbindLastDestinationSearchEvents(oldLast);
        }
        this.bindLastDestinationSearchEvents(control);
      }

      this.bindMiniFeedback(destination);

      return {
        destination: destination,
        control: control
      };
    },

    handleDestinationRemove: function(destination) {
      var index = destination.getIndex();
      this.unbindLastDestinationSearchEvents(this.timeline.remove(index));

      if (index >= this.destinations.count()) {
        var lastControl = this.timeline.get(-1);
        if (lastControl) {
          this.bindLastDestinationSearchEvents(lastControl);
          this.handleLastPlaceChange(lastControl.getPlace());
        }
      }
      //TODO(rosswang): reselect?
    },

    handleTimelineDestinationAdd: function() {
      this.destinations.add();
      this.timeline.get(-1).focus();
    },

    handleMiniDestinationAdd: function() {
      this.miniDestinationSearch.clear();
      this.map.closeActiveInfoWindow();

      var selectedDest = this.map.getSelectedDestination();
      var index = selectedDest?
        selectedDest.getIndex() + 1 : this.destinations.count();

      var destination = this.destinations.get(index);
      if (!destination || destination.hasPlace()) {
        destination = this.destinations.add(index);
      }

      destination.select();
      this.miniDestinationSearch.focus();
      this.miniDestinationSearch.setPlaceholder(
        destination.hasNext()?
          /* Actually, the terminal case where descriptionOpenEnded would differ
           * from description is always handled by the latter branch, but
           * semantically we would want the open-ended description here. */
          strings.add(describeDestination.descriptionOpenEnded(destination)) :
          strings['Add destination']);
    },

    bindMiniFeedback: function(destination) {
      var mf = this.miniFeedback;

      destination.onSelect.add(mf.handleSelect);
      destination.onDeselect.add(mf.handleDeselect);
    },

    initMiniFeedback: function() {
      var self = this;

      var selectedDestination;

      //context: destination
      function handlePlaceChange(place) {
        self.miniDestinationSearch.setPlace(place);
        self.miniDestinationSearch.setPlaceholder(
          strings.change(describeDestination.description(this)));
      }

      //context: destination
      function handleSelect() {
        selectedDestination = this;
        handlePlaceChange.call(this, this.getPlace());
        this.onPlaceChange.add(handlePlaceChange);
      }

      //context: destination
      function handleDeselect() {
        this.onPlaceChange.remove(handlePlaceChange);
        if (selectedDestination === this) {
          selectedDestination = null;
          if (self.miniDestinationSearch.getPlace()) {
            self.miniDestinationSearch.clear();
          }
          self.miniDestinationSearch.setPlaceholder(strings['Search']);
        }
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
      /* Wait until next frame to allow selection/focus to update; we don't want
       * to remove a box that has just received focus. */
      raf(this.trimUnusedDestinations);
    },

    runCommand: function(command, rest) {
      var handler = this.commands[command];
      if (handler) {
        var args = handler.parseArgs? handler.parseArgs(rest) : [rest];
        handler.op.apply(this, args);
      } else {
        this.error('Unrecognized command ' + command);
      }
    },

    handleInvite: function(invitation) {
      var self = this;

      var sender = invitation.sender;
      var owner = invitation.owner;
      var tripId = invitation.tripId;

      var message = new Message();
      message.setType(Message.INFO);
      message.setHtml(strings.invitationReceived(sender, owner));
      message.setPromise(new Promise(function(resolve, reject) {
        message.$.find('a[name=accept]').click(function() {
          self.sync.joinTripSyncGroup(owner, tripId)
            .then(invitation.delete)
            .then(function() {
              self.sync.watchForTrip(tripId);
              return strings.invitationAccepted(sender, owner);
            }).then(resolve, reject);
          return false;
        });
        message.$.find('a[name=decline]').click(function() {
          invitation.delete().then(function() {
            return strings.invitationDeclined(sender, owner);
          }).then(resolve, reject);
          return false;
        });

        invitation.onDismiss.add(function() {
          resolve(strings.invitationDismissed(sender, owner));
        });
      }));

      this.messages.push(message);
    },

    handleUserMessage: function(message, raw) {
      var match = CMD_REGEX.exec(raw);
      if (match) {
        this.runCommand(match[1], match[2]);
      } else {
        this.sync.message(message);
      }
    },

    trimUnusedDestinations: function() {
      for (var lastControl = this.timeline.get(-1);
          !lastControl.getPlace() && !lastControl.isSelected() &&
            this.destinations.count() > 1;
          lastControl = this.timeline.get(-1)) {
        this.destinations.remove(-1);
      }
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

    var destinations = this.destinations = new Destinations();
    destinations.onAdd.add(this.handleDestinationAdd);
    destinations.onRemove.add(this.handleDestinationRemove);

    var map = this.map = new MapWidget(opts);
    var maps = map.maps;
    map.bindDestinations(destinations);

    var messages = this.messages = new Messages();
    var timeline = this.timeline = new Timeline(maps);

    var error = this.error;
    var vanadiumStartup = vanadiumWrapper.init(opts.vanadium)
      .then(function(wrapper) {
        wrapper.onError.add(error);
        wrapper.onCrash.add(error);

        var identity = new Identity(wrapper.getAccountName());
        var mountNames = naming.mountNames(identity);
        messages.setUsername(identity.username);

        return {
          identity: identity,
          mountNames: mountNames,
          vanadiumWrapper: wrapper
        };
      });

    var sbName = opts.syncbase ||
      queryString.parse(location.search).syncbase || 4000;
    if ($.isNumeric(sbName)) {
      sbName = '/localhost:' + sbName;
    }

    var sync = this.sync = new TravelSync(vanadiumStartup, {
      maps: maps,
      placesService: map.createPlacesService()
    }, sbName);
    sync.bindDestinations(destinations);

    this.info(strings['Connecting...'], sync.startup
      .then(function() {
        /* Fit whatever's in the map via timeout to simplify the coding a
         * little. Otherwise we'd need to hook into the asynchronous place
         * vivification and routing. */
        setTimeout(map.fitAll, 2250);
        return strings['Connected to all services.'];
      }));

    var directionsServiceStatusStrings = buildStatusErrorStringMap(
      maps.DirectionsStatus, strings.DirectionsStatus);

    map.onError.add(function(err) {
      var message = directionsServiceStatusStrings[err.directionsStatus] ||
        strings['Unknown error'];

      error(message);
    });

    sync.onError.add(error);
    sync.onMessages.add(function(messages) {
      self.messages.push.apply(self.messages, messages);
    });

    sync.invitationManager.onInvite.add(this.handleInvite);

    messages.onMessage.add(this.handleUserMessage);

    timeline.onAddClick.add(this.handleTimelineDestinationAdd);

    var miniAddButton = this.miniAddButton = new AddButton();
    var miniDestinationSearch = this.miniDestinationSearch =
      new DestinationSearch(maps);

    miniAddButton.onClick.add(this.handleMiniDestinationAdd);

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

    miniDestinationSearch.onSubmit.add(function(value) {
      if (!value) {
        var selected = self.map.getSelectedDestination();
        if (selected) {
          selected.remove();
        }

        self.map.clearSearchMarkers();
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
      .click(this.collapseTimeline);
    $toggleTimeline.hoverintent(this.showTimeline, $.noop);

    map.addControls(maps.ControlPosition.TOP_CENTER, messages.$);
    map.addControls(maps.ControlPosition.LEFT_TOP, $miniPanel);
    map.addControls(maps.ControlPosition.LEFT_CENTER, $toggleTimeline);

    var $domRoot = opts.domRoot? $(opts.domRoot) : $('body');

    $domRoot.append($timelineContainer, map.$);

    this.initMiniFeedback();

    destinations.add();
    miniDestinationSearch.focus();

    $domRoot.keypress(function() {
      messages.open();
      /* Somehow emergent behavior types the key just hit without any further
       * code from us. Praise be to the code gods; pray for cross-browser. */
    });

    this.commands = {
      invite: {
        op: this.invite
      },

      status: {
        op: function() {
          this.messages.push(new Message({
            type: Message.INFO,
            html: strings.status(JSON.stringify(this.sync.status, null, 2))
          }));
        }
      }
    };
  }
});

module.exports = Travel;
