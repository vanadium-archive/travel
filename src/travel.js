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
var TimelineClient = require('./components/timeline-client');
var TimelineService = require('./components/timeline-server');

var CastingManager = require('./casting-manager');
var Destinations = require('./destinations');
var Identity = require('./identity');
var TravelSync = require('./travelsync');

var vanadiumWrapperDefault = require('./vanadium-wrapper');

var debug = require('./debug');
var describeDestination = require('./describe-destination');
var naming = require('./naming');
var strings = require('./strings').currentLocale;

function buildStatusErrorStringMap(statusClass, stringGroup) {
  var dict = {};
  $.each(statusClass, function(name, value) {
    dict[value] = stringGroup[name];
  });
  return dict;
}

function handleDestinationOrdinalUpdate(control, destination) {
  return control.setPlaceholder(
    describeDestination.descriptionOpenEnded(destination));
}

var CMD_REGEX = /\/(\S*)(?:\s+(.*))?/;

var Travel = defineClass({
  publics: {
    dump: function() {
      return this.sync.getData().then(function(data) {
        debug.log(data);
        return data;
      }, function(err) {
        console.error(err);
        throw err;
      });
    },

    status: function() {
      return this.sync.status;
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

    getActiveTripId: function() {
      return this.sync.getActiveTripId();
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
    },

    castTimeline: function() {

    }
  },

  privates: {
    trap: function(asyncMethod) {
      var self = this;
      return function() {
        return asyncMethod.apply(this, arguments).catch(self.error);
      };
    },

    bindControlToDestination: function(control, destination) {
      var asyncs = [];

      function updateOrdinalAsync() {
        return handleDestinationOrdinalUpdate(control, destination);
      }

      var setPlace, select, deselect, updateOrdinal;

      if (destination) {
        setPlace = this.trap(control.setPlace);
        select = this.trap(control.select);
        deselect = this.trap(control.deselect);
        updateOrdinal = this.trap(updateOrdinalAsync);

        destination.onPlaceChange.add(setPlace);
        destination.onSelect.add(select);
        destination.onDeselect.add(deselect);
        destination.onOrdinalChange.add(updateOrdinal);
        asyncs.push(control.setPlace(destination.getPlace()));
        /* Since these controls are 1:1 with destinations, we don't want to stay
         * in a state where the control has invalid text but the destination is
         * still valid; that would be confusing to the user (e.g. abandoned
         * query string "restaurants" for destination 4 Privet Drive.) */
        control.onPlaceChange.add(destination.setPlace);
      }

      asyncs.push(updateOrdinalAsync());

      if (destination && destination.isSelected()) {
        asyncs.push(control.select());
      } else {
        asyncs.push(control.deselect());
      }

      var unbind = destination? function() {
        destination.onPlaceChange.remove(setPlace);
        destination.onSelect.remove(select);
        destination.onDeselect.remove(deselect);
        destination.onOrdinalChange.remove(updateOrdinal);
        control.onPlaceChange.remove(destination.setPlace);
      } : $.noop;

      return Promise.all(asyncs).then(function() {
        return unbind;
      }, function(err) {
        unbind();
        throw err;
      });
    },

    handleDestinationAdd: function(destination) {
      var self = this;

      this.addDestinationToTimeline(this.timeline, destination)
      .then(function() {
        self.bindMiniFeedback(destination);
      }).catch(this.error);
    },

    addDestinationToTimeline: function(timeline, destination) {
      var self = this;
      return timeline.add(destination.getIndex()).then(function(control) {
        self.bindControlToDestination(control, destination);

        var asyncs = [control.setSearchBounds(self.map.getBounds())];

        control.onFocus.add(function() {
          if (!destination.isSelected()) {
            self.map.closeActiveInfoWindow();
            destination.select();
          }
        });

        control.onSearch.add(function(results) {
          /* There seems to be a bug where if you click a search suggestion (for
           * a query, not a resolved location) in autocomplete, the input box
           * under it gets clicked and focused... I haven't been able to figure
           * out why. */
          self.trap(control.focus)();

          self.map.showSearchResults(results);
        });

        if (!destination.hasNext()) {
          asyncs.push(timeline.disableAdd());
          var oldLastIndex = destination.getIndex() - 1;
          if (oldLastIndex >= 0) {
            asyncs.push(timeline.get(oldLastIndex)
              .then(function(oldLast) {
                if (oldLast) {
                  self.unbindLastDestinationSearchEvents(oldLast);
                }
              }));
          }
          self.bindLastDestinationSearchEvents(control);
        }

        return Promise.all([asyncs]);
      });
    },

    handleDestinationRemove: function(destination) {
      var self = this;
      var index = destination.getIndex();
      this.timeline.remove(index).then(function(control) {
        self.unbindLastDestinationSearchEvents(control);

        if (index >= self.destinations.count()) {
          return self.timeline.get(-1).then(function(lastControl) {
            if (lastControl) {
              self.bindLastDestinationSearchEvents(lastControl);
              self.handleLastPlaceChange(lastControl.getPlace());
            }
          });
        }
        //TODO(rosswang): reselect?
      }).catch(this.error);
    },

    handleTimelineDestinationAdd: function() {
      var self = this;
      var timeline = this.timeline;
      function selectNewControl(control) {
        control.focus().catch(self.error);
        timeline.onDestinationAdd.remove(selectNewControl);
      }
      timeline.onDestinationAdd.add(selectNewControl);

      this.destinations.add().select();
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
        this.timeline.enableAdd().catch(this.error);
      } else {
        this.timeline.disableAdd().catch(this.error);
      }
    },

    handleLastPlaceDeselected: function() {
      this.trimUnusedDestinations().catch(this.error);
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
          invitation.accept().then(function() {
            self.sync.watchForTrip(tripId);
            return strings.invitationAccepted(sender, owner);
          }).then(resolve, reject);
          return false;
        });
        message.$.find('a[name=decline]').click(function() {
          invitation.decline().then(function() {
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

    handleSendCast: function(targetOwner, targetDeviceName, spec) {
      switch (spec.panelName) {
      case 'timeline':
        this.sendTimelineCast(targetOwner, targetDeviceName);
        break;
      default:
        this.error(strings.notCastable(spec.panelName));
      }
    },

    handleReceiveCast: function(spec) {
      switch (spec.panelName) {
      case 'timeline':
        this.receiveTimelineCast();
        break;
      default:
        this.error(strings.notCastable(spec.panelName));
      }
    },

    sendTimelineCast: function(targetOwner, targetDeviceName) {
      var self = this;
      this.vanadiumStartup.then(function(args) {
        var endpoint = naming.rpcMount(
          targetOwner, targetDeviceName, 'timeline');
        return args.vanadiumWrapper.client(endpoint).then(function(ts) {
          var tc = new TimelineClient(args.vanadiumWrapper.context(),
            ts, self.dependencies);
          tc.onError.add(self.error);
          return self.adoptTimeline(tc);
        });
      }).catch(this.error);
    },

    receiveTimelineCast: function() {
      var self = this;
      var timeline = new Timeline(this.map.maps);
      var ts = new TimelineService(timeline, this.dependencies);

      this.vanadiumStartup.then(function(args) {
        return args.vanadiumWrapper.server(
          args.mountNames.rpcMount('timeline'), ts);
      }).then(function() {
        //TODO(rosswang): delay swap until after initialized
        self.$appRoot.replaceWith(timeline.$);
      }).catch(this.error);
    },

    adoptTimeline: function(timeline) {
      var self = this;
      timeline.onAddClick.add(this.handleTimelineDestinationAdd);
      this.map.onBoundsChange.add(this.trap(timeline.setSearchBounds));
      var async = Promise.resolve();
      this.destinations.each(function(i, destination) {
        async = async.then(function() {
          return self.addDestinationToTimeline(timeline, destination);
        });
      });
      this.timeline = timeline;
      if (timeline.$) {
        this.$timelineContainer.empty().append(timeline.$).show();
        this.$toggleTimeline.show();
      } else {
        this.$timelineContainer.hide();
        this.$toggleTimeline.hide();
      }
      this.map.invalidateSize();
      return async;
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
      var self = this;

      var lastIndex = this.destinations.count() - 1;
      if (lastIndex > 0) {
        return this.timeline.get(lastIndex).then(function(lastControl) {
          return Promise.all([
            lastControl.getPlace(),
            lastControl.isSelected()
          ]);
        }).then(function(conditions) {
          if (!(conditions[0] || conditions[1])) {
            //check for race condition; if we're no longer up-to-date
            //just execute the next "iteration" without actually removing
            if (lastIndex === self.destinations.count() - 1) {
              self.destinations.remove(-1);
            }
            return self.trimUnusedDestinations();
          }
        });
      } else {
        return Promise.resolve();
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
    var vanadiumStartup = this.vanadiumStartup =
      vanadiumWrapper.init(opts.vanadium)
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

    this.dependencies = {
      maps: maps,
      placesService: map.createPlacesService()
    };

    var sync = this.sync = new TravelSync(
      vanadiumStartup, this.dependencies, sbName);
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
    sync.onPossibleNearbyDevices.add(function() {
      self.info(strings.castingTooltip);
    });
    sync.onMessages.add(function(messages) {
      self.messages.push.apply(self.messages, messages);
    });

    sync.invitationManager.onInvite.add(this.handleInvite);

    messages.onMessage.add(this.handleUserMessage);

    var miniAddButton = this.miniAddButton = new AddButton();
    var miniDestinationSearch = this.miniDestinationSearch =
      new DestinationSearch(maps);

    miniAddButton.onClick.add(this.handleMiniDestinationAdd);

    miniDestinationSearch.setPlaceholder(strings['Search']).catch(error);
    miniDestinationSearch.setSearchBounds(map.getBounds()).catch(error);
    map.onBoundsChange.add(this.trap(miniDestinationSearch.setSearchBounds));

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
      } else {
        self.map.disableLocationSelection();
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
      .addClass('timeline-container collapsed');

    var $toggleTimeline = this.$toggleTimeline = $('<div>')
      .addClass('toggle-timeline no-select collapsed')
      .text(strings['Timeline'])
      .click(this.collapseTimeline);
    $toggleTimeline.hoverintent(this.showTimeline, $.noop);

    map.addControls(maps.ControlPosition.TOP_CENTER, messages.$);
    map.addControls(maps.ControlPosition.LEFT_TOP, $miniPanel);
    map.addControls(maps.ControlPosition.LEFT_CENTER, $toggleTimeline);

    var $domRoot = this.$domRoot = opts.domRoot? $(opts.domRoot) : $('body');
    var $appRoot = this.$appRoot = $('<div>');

    $domRoot.append($appRoot.append($timelineContainer, map.$));

    this.initMiniFeedback();

    var castingManager = new CastingManager(sync);
    castingManager.makeCastable($timelineContainer, {
      spec: {
        panelName: 'timeline'
      }
    });
    castingManager.onAmbiguousCast.add(function(related, unknown, other) {
      console.debug('ambiguous cast');
      console.debug(related);
      console.debug(unknown);
      console.debug(other);
    });
    castingManager.onNoNearbyDevices.add(function() {
      self.error(strings.noNearbyDevices);
    });
    castingManager.onError.add(error);

    castingManager.onSendCast.add(this.handleSendCast);
    sync.onReceiveCast.add(this.handleReceiveCast);

    this.adoptTimeline(timeline);

    destinations.add();
    miniDestinationSearch.focus().catch(error);

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
            html: strings.status(JSON.stringify(this.status(), null, 2))
          }));
        }
      }
    };
  }
});

module.exports = Travel;
