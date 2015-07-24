var global = require('global');
var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

var strings = require('../strings')();
var Messages = require('./messages');

var Widget = defineClass({
  publics: {
    clearMarkers: function() {
      var markers = this.markers;
      this.markers = [];
      $.each(markers, function(i, marker) {
        marker.setMap(null);
      });
    },
    
    message: function(message) {
      this.messages.push(message);
    }
  },
  
  constants: ['$'],
  
  // https://developers.google.com/maps/documentation/javascript/tutorial
  init: function(maps) {
    maps = maps || global.google.maps;
    var widget = this;
    
    this.$ = $('<div>').addClass('map-canvas');
    
    this.markers = [];
    this.messages = new Messages();
    
    var config = {
      zoom: 11,
      center: new maps.LatLng(37.4184, -122.0880) //Googleplex
    };
    
    var map = new maps.Map(this.$[0], config);
  
    // https://developers.google.com/maps/documentation/javascript/examples/map-geolocation
    if (global.navigator && global.navigator.geolocation) {
      global.navigator.geolocation.getCurrentPosition(function(position) {
        map.setCenter(new maps.LatLng(position.coords.latitude,
          position.coords.longitude));
      });
    }
  
    var controls = map.controls;
    
    var $searchBox = $('<input>')
      .attr('type', 'text')
      .attr('placeholder', strings['Search']);
    var txtSearchBox = $searchBox[0];
    controls[maps.ControlPosition.TOP_LEFT].push(txtSearchBox);
    
    controls[maps.ControlPosition.TOP_CENTER].push(this.messages.$[0]);
    
    var searchBox = new maps.places.SearchBox(txtSearchBox);
    
    maps.event.addListener(map, 'bounds_changed', function() {
      searchBox.setBounds(map.getBounds());
    });
    
    maps.event.addListener(searchBox, 'places_changed', function() {
      var places = searchBox.getPlaces();
      if (places.length == 1) {
        var place = places[0];
        widget.markers.push(new maps.Marker({
          map: map,
          title: place.name,
          position: place.geometry.location
        }));
      }
    });
  }
});

module.exports = Widget;
