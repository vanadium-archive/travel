var $ = require('../src/util/jquery');
var defineClass = require('../src/util/define-class');

var ControlPosition = {
  LEFT_TOP: 'lt',
  TOP_LEFT: 'tl',
  TOP_CENTER: 'tc'
};

var ControlPanel = defineClass({
  init: function(parent) {
    this.$ = $('<div>');
    this.$.appendTo(parent);
  },

  publics: {
    push: function(child) {
      this.$.append(child);
    }
  }
});

var InfoWindow = defineClass({
  publics: {
    open: function(map, marker) {
      this.map = map;
      map.registerInfoWindow(this.ifc);
    },

    close: function() {
      this.map.unregisterInfoWindow(this.ifc);
    },

    toString: function() { return 'mock InfoWindow'; }
  }
});

var Map = defineClass({
  publics: {
    registerInfoWindow: function(wnd) {
      this.infoWindows.push(wnd);
    },

    unregisterInfoWindow: function(wnd) {
      this.infoWindows = this.infoWindows.filter(function(elem) {
        return elem !== wnd;
      });
    },

    hasInfoWindow: function(wnd) {
      return wnd? wnd in this.infoWindows : this.infoWindows.length > 0;
    },

    toString: function() { return 'mock Map'; }
  },

  constants: [ 'controls' ],

  events: {
    //some maps API members are lower_underscore
    /* jshint camelcase: false */
    bounds_changed: 'public',
    click: 'public'
    /* jshint camelcase: true */
  },

  init: function(canvas) {
    this.controls = {};
    this.controls[ControlPosition.LEFT_TOP] = new ControlPanel(canvas);
    this.controls[ControlPosition.TOP_CENTER] = new ControlPanel(canvas);
    this.controls[ControlPosition.TOP_LEFT] = new ControlPanel(canvas);

    this.infoWindows = [];
  }
});

var Marker = defineClass({
  publics: {
    setClickable: function(){},

    setIcon: function(icon) {
      this.icon = icon;
    },

    getIcon: function() {
      return this.icon;
    },

    setMap: function(map) {
      this.map = map;
    },

    getMap: function() {
      return this.map;
    },

    toString: function() { return 'mock Marker'; }
  },

  events: {
    click: 'public'
  },

  init: function(opts) {
    $.extend(this, opts);
  }
});

var SearchBox = defineClass({
  publics: {
    toString: function() { return 'mock SearchBox'; }
  },

  events: {
    //some maps API members are lower_underscore
    /* jshint camelcase: false */
    places_changed: 'public'
    /* jshint camelcase: true */
  }
});

module.exports = {
  ControlPosition: ControlPosition,
  DirectionsService: function(){},
  DirectionsStatus: {},
  Geocoder: function(){},
  InfoWindow: InfoWindow,
  LatLng: function(){},
  Map: Map,
  Marker: Marker,

  event: {
    addListener: function(instance, eventName, handler){
      if (eventName in instance) {
        instance[eventName].add(handler);
      } else {
        throw instance + ' does not mock event ' + eventName;
      }
    },
    trigger: function(instance, eventName) {
      instance[eventName].apply(instance,
        Array.prototype.slice.call(arguments, 2));
    }
  },

  places: {
    SearchBox: SearchBox,
    mockPlaceResult: {
      geometry: {}
    }
  }
};