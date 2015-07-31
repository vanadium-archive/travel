// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var uuid = require('uuid');

module.exports = Identity;

function Identity(accountName) {
  this.username = extractUsername(accountName);
  this.deviceType = 'desktop';
  this.deviceId = uuid.v4();

  this.deviceName = this.deviceType + '_' + this.deviceId;
  this.entityName = this.username + '/' + this.deviceName;
}

function autoUsername() {
  return uuid.v4();
}

function extractUsername(accountName) {
  if (!accountName || accountName === 'unknown') {
    return autoUsername();
  }

  var parts = accountName.split('/');
  if (parts[0] !== 'dev.v.io' || parts[1] !== 'u') {
    return accountName;
  }

  return parts[2];
}
