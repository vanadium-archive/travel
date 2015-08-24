// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var uuid = require('uuid');

module.exports = Identity;

function Identity(accountName) {
  var account = processAccountName(accountName);

  this.account = account.name;
  this.username = account.username;
  this.deviceType = 'desktop';
  this.deviceId = uuid.v4();

  this.deviceName = this.deviceType + '_' + this.deviceId;
  this.entityName = this.username + '/' + this.deviceName;
}

Identity.blessingForUsername = function(username) {
  return 'dev.v.io/u/' + username;
};

function autoUsername() {
  return uuid.v4();
}

var ACCOUNT_REGEX = /(dev\.v\.io\/u\/([^\/]+)).*/;

function processAccountName(accountName) {
  if (!accountName || accountName === 'unknown') {
    return {
      name: '...',
      username: autoUsername()
    };
  }

  var match = ACCOUNT_REGEX.exec(accountName);
  return match? {
    name: match[1],
    username: match[2]
  } : {
    name: accountName,
    username: accountName
  };
}
