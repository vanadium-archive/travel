// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('../src/util/jquery');
var defineClass = require('../src/util/define-class');

var maps;

var PLACES = {
  GATEWAY_ARCH: {
    coords: {
      latitude: 38.6,
      longitude: -90.2
    },
    placeId: '5TL0U15'
  },
  GRAND_CANYON: {
    coords: {
      latitude: 36.1,
      longitude: -112.1
    },
    placeId: '6R4NDC4NY0N'
  },
  GOLDEN_GATE: {
    coords: {
      latitude: 37.8,
      longitude: -122.5
    },
    placeId: '60LD3N64T3'
  },
  SPACE_NEEDLE: {
    coords: {
      latitude: 47.6,
      longitude: -122.3
    },
    placeId: '5P4C3N33DL3'
  }
};

var ControlPosition = {
  LEFT_CENTER: 'lc',
  LEFT_TOP: 'lt',
  TOP_CENTER: 'tc',
  TOP_LEFT: 'tl'
};

var GeocoderStatus = {
  OK: 0,
  ERROR: 1
};

var PlacesServiceStatus = {
  OK: 0,
  ZERO_RESULTS: 1
};

var TravelMode = {
  DRIVING: 0
};

var ControlPanel = defineClass({
  publics: {
    push: function(child) {
      this.$.append(child);
    }
  },

  init: function(parent) {
    this.$ = $('<div>');
    this.$.appendTo(parent);
  }
});

var DirectionsRenderer = defineClass({
  publics: {
    setMap: function(){},
    toString: function() { return 'mock DirectionsRenderer'; }
  }
});

var DirectionsService = defineClass({
  publics: {
    route: function(){},
    toString: function() { return 'mock DirectionsService'; }
  }
});

function geoResolver(location) {
  var result;
  $.each(maps.places.corpus, function() {
    if (location.lat() === this.coords.latitude &&
        location.lng() === this.coords.longitude) {
      result = placeResult(this);
      return false;
    }
  });
  return result;
}

var Geocoder = defineClass({
  publics: {
    geocode: function(request, callback) {
      var self = this;
      process.nextTick(function() {
        var results = [];

        var output = self.resolver(request.location);
        if (output) {
          results.push(output);
        }

        callback(results, output? GeocoderStatus.OK : GeocoderStatus.ERROR);
      });
    },

    toString: function() { return 'mock Geocoder'; }
  },

  init: function(resolver) {
    this.resolver = resolver || geoResolver;
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

var LatLng = defineClass({
  publics: {
    lat: function() {
      return this.latitude;
    },

    lng: function() {
      return this.longitude;
    },

    toString: function() { return 'mock LatLng (' +
      this.lat() + ', ' + this.lng() + ')'; }
  },

  init: function(lat, lng) {
    this.latitude = lat;
    this.longitude = lng;
  }
});

var LatLngBounds = defineClass({
  publics: {
    contains: function(){},
    extend: function(){},
    toSpan: function(){},

    toString: function() { return 'mock LatLngBounds'; }
  }
});

var Map = defineClass({
  publics: {
    getBounds: function(){
      return new LatLngBounds();
    },

    setCenter: function(){},
    panTo: function(){},
    fitBounds: function(){},

    setOptions: function(){},

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
    'bounds_changed': 'public',
    click: 'public'
  },

  init: function(canvas) {
    var self = this;
    this.controls = {};
    $.each(ControlPosition, function() {
      self.controls[this] = new ControlPanel(canvas);
    });

    this.infoWindows = [];

    if (maps.onNewMap) {
      maps.onNewMap(this.ifc);
    }
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
      var old = this.map;
      if (old !== map) {
        this.map = map;
        this.onMapChange(map, old);
      }
    },

    getMap: function() {
      return this.map;
    },

    getPlace: function() {
      return this.place;
    },

    setTitle: function(){},

    toString: function() { return 'mock Marker'; }
  },

  events: {
    click: 'public',
    onMapChange: ''
  },

  init: function(opts) {
    $.extend(this, opts);

    if (maps.onNewMarker) {
      maps.onNewMarker(this.ifc);
    }
  }
});

function placeResult(data) {
  return {
    geometry: {
      location: new LatLng(data.coords.latitude, data.coords.longitude)
    },
    'place_id': data.placeId
  };
}

var PlacesService = defineClass({
  publics: {
    getDetails: function(request, callback){
      $.each(maps.places.corpus, function() {
        if (request.placeId === this.placeId) {
          callback(placeResult(this), PlacesServiceStatus.OK);
          return false;
        }
      });

      callback(null, PlacesServiceStatus.ZERO_RESULTS);
    },

    toString: function() { return 'mock PlacesService'; }
  }
});

var SearchBox = defineClass({
  publics: {
    setBounds: function(){},

    getPlaces: function() {
      return this.places;
    },

    toString: function() { return 'mock SearchBox'; }
  },

  privates: {
    mockResults: function(places) {
      this.places = places.map(placeResult);
      this['places_changed']();
    }
  },

  events: {
    'places_changed': 'public'
  },

  init: function(input) {
    $(input).data('mockResults', this.mockResults);
  }
});

maps = {
  ControlPosition: ControlPosition,
  DirectionsRenderer: DirectionsRenderer,
  DirectionsService: DirectionsService,
  DirectionsStatus: {},
  Geocoder: Geocoder,
  GeocoderStatus: GeocoderStatus,
  InfoWindow: InfoWindow,
  LatLng: LatLng,
  LatLngBounds: LatLngBounds,
  Map: Map,
  Marker: Marker,
  TravelMode: TravelMode,

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
    corpus: PLACES,

    PlacesService: PlacesService,
    PlacesServiceStatus: PlacesServiceStatus,
    SearchBox: SearchBox,
    mockPlaceResult: {
      geometry: {}
    }
  }
};

module.exports = maps;