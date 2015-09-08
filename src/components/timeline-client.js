// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var defineClass = require('../util/define-class');

var ifcx = require('../ifc/conversions');

var destDefs = {
  getPlace: function() {
    var self = this;
    return this.outer.service.getDestinationPlace(this.outer.context, this.id)
      .then(function(place) {
        return ifcx.toPlace(self.outer.dependencies, place);
      });
  },

  setPlace: function(place) {
    return this.outer.service.setDestinationPlace(this.outer.context, this.id,
      ifcx.fromPlace(place) || null);
  },

  setPlaceholder: function(placeholder) {
    return this.outer.service.setDestinationPlaceholder(this.outer.context,
      this.id, placeholder);
  },

  setSearchBounds: function(bounds) {
    return this.outer.service.setDestinationSearchBounds(this.outer.context,
      this.id, ifcx.fromLatLngBounds(bounds));
  }
};

function bindDestinationMethod(localMethod, remoteMethod) {
  destDefs[localMethod] = function() {
    return this.outer.service[remoteMethod](this.outer.context, this.id);
  };
}

['clear', 'enable', 'disable', 'focus', 'select', 'deselect'].forEach(
function(method) {
  bindDestinationMethod(method, method + 'Destination');
});

bindDestinationMethod('hasFocus', 'destinationHasFocus');
bindDestinationMethod('isSelected', 'isDestinationSelected');
bindDestinationMethod('getValue', 'getDestinationValue');

var TimelineClient = defineClass({
  publics: {
    disableAdd: function() {
      return this.service.disableAdd(this.context);
    },

    enableAdd: function() {
      return this.service.enableAdd(this.context);
    },

    add: function(i) {
      return this.service.add(this.context, ifcx.box(i))
        .then(this.getDestination);
    },

    get: function(i) {
      return this.service.get(this.context, ifcx.box(i))
        .then(this.getDestinationOrDestinations);
    },

    remove: function(i) {
      return this.service.get(this.context, ifcx.box(i))
        .then(this.getDestination);
    },

    setSearchBounds: function(bounds) {
      return this.service.setSearchBounds(this.context,
        ifcx.fromLatLngBounds(bounds));
    }
  },

  privates: {
    destinationClient: defineClass.innerClass({
      publics: destDefs,

      privates: {
        /**
         * @param localEventName the name of the event on the client object
         * @param remoteEventName the name of the streaming API serving the
         *  event on the remote server
         * @param translateArgs a function taking the remote event data and
         *  returning an array of arguments or returning a promise resolving to
         *  an array of arguments to be passed to local event handlers.
         */
        bindEvent: function(localEventName, remoteEventName, translateArgs) {
          var self = this;

          var event = this.outer.service[remoteEventName]
            (this.outer.context, this.id);
          event.catch(this.outer.onError);
          event.stream.on('error', this.outer.onError);
          event.stream.on('data', function(e) {
            Promise.resolve(translateArgs && translateArgs(e))
              .then(function(args) {
                self[localEventName].apply(self, args);
              }).catch(self.outer.onError);
          });
        }
      },

      events: [
        'onDeselect',
        'onFocus',
        'onPlaceChange',
        'onSearch',
        'onSubmit'
      ],

      init: function(id) {
        var self = this;

        this.id = id;

        this.bindEvent('onDeselect', 'onDestinationDeselect');
        this.bindEvent('onFocus', 'onDestinationFocus');
        this.bindEvent('onPlaceChange', 'onDestinationPlaceChange',
          function(e) {
            return Promise.all([
              ifcx.toPlace(self.outer.dependencies, e.place),
              ifcx.toPlace(self.outer.dependencies, e.previous)
            ]);
          });
        this.bindEvent('onSearch', 'onDestinationSearch', function(e) {
          return Promise.all(e.places.map(function(place) {
            return ifcx.toPlace(self.outer.dependencies, place);
          })).then(function(places) {
            return [places];
          });
        });
        this.bindEvent('onSubmit', 'onDestinationSubmit', function(e) {
          return [e.value];
        });
      }
    }),

    getDestination: function(id) {
      if (!id) {
        return null;
      }

      var destClient = this.destinations[id];
      if (!destClient) {
        destClient = this.destinations[id] = this.destinationClient(id);
      }
      return destClient;
    },

    getDestinationOrDestinations: function(idOrIds) {
      return idOrIds.ids?
        idOrIds.ids.map(this.getDestination) : this.getDestination(idOrIds.id);
    },

    bindEvent: function(eventName, translateArgs) {
      var self = this;

      var event = this.service[eventName](this.context);
      event.catch(this.onError);
      event.stream.on('error', this.onError);
      event.stream.on('data', function(e) {
        self[eventName].apply(self, translateArgs && translateArgs(e));
      });
    }
  },

  events: {
    onAddClick: '',
    onDestinationAdd: '',
    onError: 'memory'
  },

  init: function(context, service, dependencies) {
    var self = this;

    this.context = context;
    this.service = service;
    this.dependencies = dependencies;
    this.destinations = {};

    this.bindEvent('onAddClick');
    this.bindEvent('onDestinationAdd', function(e) {
      return [ self.getDestination(e.id) ];
    });
  }
});

module.exports = TimelineClient;
