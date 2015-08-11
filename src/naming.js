// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var vanadium = require('vanadium');

var ROOT = '/ns.dev.v.io:8101';

function userMount(username) {
  return vanadium.naming.join(ROOT, 'users', username);
}

function appMount(username) {
  return vanadium.naming.join(userMount(username), 'travel');
}

function deviceMount(username, deviceName) {
  return vanadium.naming.join(appMount(username), deviceName);
}

function mountNames(id) {
  return {
    user: userMount(id.username),
    app: appMount(id.username),
    device: deviceMount(id.username, id.deviceName)
  };
}

module.exports = {
  userMount: userMount,
  appMount: appMount,
  deviceMount: deviceMount,
  mountNames: mountNames
};
