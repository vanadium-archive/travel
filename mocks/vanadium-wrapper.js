// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var Deferred = require('vanadium/src/lib/deferred');

module.exports = {
  init: function(){
    return new Deferred().promise;
  }
};