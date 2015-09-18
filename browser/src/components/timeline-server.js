// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var $ = require('../util/jquery');

var ifcx = require('../ifc/conversions');
var uuid = require('uuid');

var vdlTravel = require('../../ifc');

function addEventStreamListener(context, event, eventFactory, $stream) {
  return new Promise(function(resolve, reject) {
    function listener() {
      try {
        var buffOk = $stream.write(eventFactory.apply(context, arguments), null,
          function(err) {
            if (err) {
              reject(err);
            }
          });
        if (!buffOk) {
          reject('Event buffer full.');
        }
      } catch (err) {
        reject(err);
      }
    }

    event.add(listener);
    $stream.on('end', function() {
      event.remove(listener);
      resolve();
    });
    $stream.on('error', reject);
  });
}

function multiplexedEvent(eventName, eventFactory) {
  return function(ctx, serverCall, id, $stream) {
    var event = this.destinations[id][eventName];
    function multiplexedFactory() {
      // Prepend id to the arg list.
      var args = [id];
      Array.prototype.push.apply(args, arguments);
      return eventFactory.apply(this, args);
    }
    return addEventStreamListener(this, event, multiplexedFactory, $stream);
  };
}

function event(eventName, eventFactory) {
  return function(ctx, serverCall, $stream) {
    var event = this.timeline[eventName];
    return addEventStreamListener(this, event, eventFactory, $stream);
  };
}

/**
 * We can't defineClass this because v23 checks length property of each member
 * function, and we'd have to new Function each one to preserve that.
 *
 * @param timeline the timeline control to serve.
 * @param maps
 */
function TimelineService(timeline, maps) {
  this.timeline = timeline;
  this.maps = maps;
  this.destinations = {};
  this.destinationIds = new Map();

  this._identifyDestination = identifyDestination.bind(this);
  this._identifyDestinationOrDestinations =
    identifyDestinationOrDestinations.bind(this);

  timeline.onDestinationAdd.add(this._identifyDestination);
  timeline.get().then(function(destinations) {
    destinations.forEach(this._identifyDestination);
  });
}

TimelineService.prototype = new vdlTravel.Timeline();

function identifyDestination(destination) {
  if (!destination) {
    return '';
  }

  var id = this.destinationIds.get(destination);
  if (!id) {
    id = uuid.v4();
    this.destinations[id] = destination;
    this.destinationIds.set(destination, id);
  }
  return id;
}

function identifyDestinationOrDestinations(polyd) {
  return new vdlTravel.IdOrIds($.isArray(polyd)?
    { ids: polyd.map(this._identifyDestination) } :
    { id: this._identifyDestination(polyd) });
}

$.extend(TimelineService.prototype, {
  destinationHasFocus: function(ctx, serverCall, id) {
    return this.destinations[id].hasFocus();
  },

  isDestinationSelected: function(ctx, serverCall, id) {
    return this.destinations[id].isSelected();
  },

  getDestinationPlace: function(ctx, serverCall, id) {
    return this.destinations[id].getPlace().then(ifcx.fromPlace);
  },

  setDestinationPlace: function(ctx, serverCall, id, place) {
    var destination = this.destinations[id];
    return destination.setPlace(ifcx.toPlace(this.maps, place));
  },

  setDestinationPlaceholder: function(ctx, serverCall, id, placeholder) {
    this.destinations[id].setPlaceholder(placeholder);
  },

  setDestinationSearchBounds: function(ctx, serverCall, id, bounds) {
    this.destinations[id].setSearchBounds(
      ifcx.toLatLngBounds(this.maps, bounds));
  },

  getDestinationValue: function(ctx, serverCall, id) {
    return this.destinations[id].getValue();
  },

  onDestinationDeselect: multiplexedEvent('onDeselect',
    function(id) {
      return new vdlTravel.MultiplexedEvent({
        source: id
      });
    }),

  onDestinationFocus: multiplexedEvent('onFocus',
    function(id) {
      return new vdlTravel.MultiplexedEvent({
        source: id
      });
    }),

  onDestinationPlaceChange: multiplexedEvent('onPlaceChange',
    function(id, place, previous) {
      return new vdlTravel.DestinationPlaceChangeEvent({
        source: id,
        place: ifcx.fromPlace(place),
        previous: ifcx.fromPlace(previous)
      });
    }),

  onDestinationSearch: multiplexedEvent('onSearch',
    function(id, places) {
      return new vdlTravel.DestinationSearchEvent({
        source: id,
        places: places.map(ifcx.fromPlace)
      });
    }),

  onDestinationSubmit: multiplexedEvent('onSubmit',
    function(id, value) {
      return new vdlTravel.DestinationSubmitEvent({
        source: id,
        value: value
      });
    }),

  setSearchBounds: function(ctx, serverCall, bounds) {
    this.timeline.setSearchBounds(
      ifcx.toLatLngBounds(this.maps, bounds));
  },

  onAddClick: event('onAddClick',
    function() {
      return new vdlTravel.Event();
    }),

  onDestinationAdd: event('onDestinationAdd',
    function(destinationSearch) {
      return new vdlTravel.DestinationAddEvent({
        id: this._identifyDestination(destinationSearch)
      });
    })
});

['clear', 'enable', 'disable', 'focus', 'select', 'deselect']
.forEach(function(method) {
  TimelineService.prototype[method + 'Destination'] =
    function(ctx, serverCall, id) {
      this.destinations[id][method]();
    };
});

['disableAdd', 'enableAdd'].forEach(function(method) {
  TimelineService.prototype[method] = function(ctx, serverCall) {
    this.timeline[method]();
  };
});

['add', 'remove'].forEach(function(method) {
  TimelineService.prototype[method] = function(ctx, serverCall, i) {
    return this.timeline[method](ifcx.unbox(i)).then(this._identifyDestination);
  };
});

TimelineService.prototype.get = function(ctx, serverCall, i) {
  return this.timeline.get(ifcx.unbox(i))
    .then(this._identifyDestinationOrDestinations);
};

module.exports = TimelineService;
