// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('../src/util/jquery');

module.exports = {
  init: function(){
    return $.Deferred().promise();
  }
};