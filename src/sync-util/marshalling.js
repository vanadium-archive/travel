// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

function marshal(x) {
  return JSON.stringify(x);
}

function unmarshal(x) {
  if (!x) {
    return x;
  }

  if (typeof x === 'object') {
    throw new TypeError('Unexpected persisted object ' + JSON.stringify(x));
  }

  return JSON.parse(x);
}

function readValue(entry) {
  return unmarshal(typeof entry === 'object'? entry._ : entry);
}

module.exports = {
  marshal: marshal,
  unmarshal: unmarshal,
  readValue: readValue
};