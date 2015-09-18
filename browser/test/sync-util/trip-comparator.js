// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var test = require('tape');

var tripComparator = require('../../src/sync-util/trip-comparator');
var cmp = tripComparator.compareTrips;
var Ct = tripComparator.ComparableTrip;

function trip(length) {
  var trips = [];
  for (var i = 0; i < length; i++) {
    trips.push(i);
  }

  return {
    destinations: JSON.stringify(trips)
  };
}

function symeq(t, a, b, astr, bstr) {
  t.equal(cmp(a, b), 0, astr + ' = ' + bstr);
  t.equal(cmp(b, a), 0, bstr + ' = ' + astr);
}

function symord(t, sm, lg, smstr, lgstr) {
  t.equal(cmp(sm, lg), -1, lgstr? smstr + ' < ' + lgstr : smstr);
  t.equal(cmp(lg, sm), 1, lgstr? lgstr + ' > ' + smstr : smstr);
}

test('null/undef', function(t) {
  t.equal(cmp(undefined, undefined), 0, 'undef = undef');
  t.equal(cmp(null, null), 0, 'null = null');
  symeq(t, null, undefined, 'null', 'undefined');
  var ct = new Ct(trip(0), '0', undefined);
  symord(t, ct, undefined, 'trip', 'undefined');
  symord(t, ct, null, 'trip', 'null');
  t.end();
});

test('cmps', function(t) {
  symord(t, new Ct(trip(0), '0', 1), new Ct(trip(0), '0', undefined),
    'trip with latestSwitch first');
  symord(t, new Ct(trip(0), '0', 0), new Ct(trip(0), '0', -1),
    'trip with latest switch first');
  symord(t, new Ct(trip(1), '0', 0), new Ct(trip(0), '0', 0),
    'longest trip first');
  symord(t, new Ct(trip(1), 'a', 1), new Ct(trip(1), 'b', 1),
    'smallest ID first');

  t.end();
});