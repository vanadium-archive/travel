// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var htmlEncode = require('htmlencode').htmlEncode;

function text(plainText) {
  return htmlEncode(plainText);
}

function link(name, linkText) {
  return '<a name="' + name + '" href="#">' + text(linkText) + '</a>';
}

function pre(preText) {
  return '<pre>' + preText + '</pre>';
}

function ownerOfTrip(sender, owner) {
  return sender === owner? 'a' : owner + '\'s';
}

function getStrings(locale) {
  return {
    'Add destination': 'Add destination',
    add: function(object) {
      return 'Add ' + object.toLowerCase();
    },
    change: function(object) {
      return 'Change ' + object.toLowerCase();
    },
    'Connected to all services.': 'Connected to all services.',
    'Connecting...': 'Connecting...',
    'Destination': 'Destination',
    destination: function(n) {
      return 'Destination ' + n;
    },
    DirectionsStatus: {
      NOT_FOUND: 'Location not found',
      ZERO_RESULTS: 'No route to destination',
      MAX_WAYPOINTS_EXCEEDED: 'Maximum number of waypoints exceeded',
      OVER_QUERY_LIMIT: 'Request rate exceeded',
      REQUEST_DENIED: 'Request denied',
      UNKNOWN_ERROR: 'Server error'
    },
    'Final destination': 'Final destination',
    label: function(label, details) {
      return label + ': ' + details;
    },
    invitationAccepted: function(sender, owner) {
      return 'Accepted invite from ' + sender + ' to join ' +
        ownerOfTrip(sender, owner) + ' trip.';
    },
    invitationDeclined: function(sender, owner) {
      return 'Declined invite from ' + sender + ' to join ' +
        ownerOfTrip(sender, owner) + ' trip.';
    },
    invitationDismissed: function(sender, owner) {
      return sender + ' has invited you to join ' + ownerOfTrip(sender, owner) +
        ' trip. (Expired)';
    },
    invitationReceived: function(sender, owner) {
      return text(sender + ' has invited you to join ' +
        ownerOfTrip(sender, owner) + ' trip. ') +
        link('accept', 'Accept') + text(' / ') + link('decline', 'Decline');
    },
    invitationSent: function(recipient, sender) {
      return sender?
        sender + ' invited ' + recipient + ' to join the trip.' :
        'Invited ' + recipient + ' to join the trip.';
    },
    'Not connected': 'Not connected',
    notReachable: function(username) {
      return username + ' is not reachable or is not a Travel Planner user.';
    },
    'Origin': 'Origin',
    'Search': 'Search',
    sendingInvite: function(username) {
      return 'Inviting ' + username + ' to join the trip...';
    },
    status: function(status) {
      return text('Status: ') + pre(status);
    },
    'Timeline': 'Timeline',
    'Travel Planner': 'Travel Planner',
    'Trip is still initializing.' : 'Trip is still initializing.',
    'Unknown error': 'Unknown error'
  };
}

getStrings.currentLocale = getStrings();

module.exports = getStrings;