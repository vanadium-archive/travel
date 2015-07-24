var $ = require('../src/util/jquery')
var defineClass = require('../src/util/define-class')

var ControlPosition = {
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

module.exports = {
  Map: function(canvas) {
    this.controls = {};
    this.controls[ControlPosition.TOP_CENTER] = new ControlPanel(canvas);
    this.controls[ControlPosition.TOP_LEFT] = new ControlPanel(canvas);
  },
  LatLng: function(){},
  ControlPosition: ControlPosition,
  
  places: {
    SearchBox: function(){}
  },
  
  event: {
    addListener: function(){}
  }
};