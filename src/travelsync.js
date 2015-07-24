var defineClass = require('./util/define-class');

var vdlTravel = require('../ifc');

var TravelSync = defineClass({
  events: ['onMessage', 'onPlanUpdate', 'onStatusUpdate'],
  init: function() {
    this.tripPlan = [];
    this.tripStatus = {};
    
    // TODO: sync initial state
    this.server = new vdlTravel.TravelSync();

    var travelSync = this;
    this.server.get = function(ctx, serverCall) {
      return {
        Plan: travelSync.tripPlan,
        Status: travelSync.tripStatus
      };
    };

    this.server.updatePlan = function(ctx, serverCall, plan, message) {
      travelSync.tripPlan = plan;
      travelSync.onPlanUpdate(plan);
      travelSync.onMessage(message);
    };

    this.server.updateStatus = function(ctx, serverCall, status) {
      travelSync.tripStatus = status;
      travelSync.onStatusUpdate(status);
    };
  },
  publics: {
    start: function(mountName, v) {
      return v.server(mountName, this.server);
    },
    pushTrip: function() {
    },
    pushStatus: function() {
    }
  }
});

module.exports = TravelSync;
