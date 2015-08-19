// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var test = require('tape');

var uuid = require('uuid');

var $ = require('../src/util/jquery');
var Travel = require('../src/travel');

var mockMaps = require('../mocks/google-maps');
var MockNavigator = require('../mocks/navigator');
var MockSyncbaseWrapper = require('../mocks/syncbase-wrapper');
var mockVanadiumWrapper = require('../mocks/vanadium-wrapper');

var PLACES = mockMaps.places.corpus;

//All SLAs are expressed in milliseconds.
var UI_SLA = 50;
/**
 * Syncbase doesn't yet provide us any notification that the first sync after
 * joining the initial sync groups has happened. This SLA is currently based on
 * a similar timeout in the Travel app, though in the future if that logic gets
 * smarter we can shrink it to the sync SLA.
 *
 * Set to 2500 for real testing, 250 for watch.
 */
var STABLE_SLA = 2500;
var SYNC_SLA = MockSyncbaseWrapper.SYNC_SLA;

function cleanDom() {
  $('body').empty();
}

function newDomRoot() {
  var $root = $('<div>');
  $('body').append($root);
  return $root;
}

test('domRoot', function(t) {
  var $root = newDomRoot();

  /* jshint -W031 */ //top-level application
  new Travel({
    maps: mockMaps,
    vanadiumWrapper: mockVanadiumWrapper,
    syncbase: 'dummy',
    domRoot: $root[0]
  });
  /* jshint +W031 */

  t.ok($root.children().length, 'app parented to given root');

  t.end();
  cleanDom();
});

test('messages', function(t) {
  var travel = new Travel({
    maps: mockMaps,
    vanadiumWrapper: mockVanadiumWrapper,
    syncbase: 'dummy'
  });

  var $messages = $('.messages ul');
  t.ok($messages.length, 'message display exists');
  var $messageItems = $messages.children();
  t.equals($messageItems.length, 1,
    'message display has initial status message');

  travel.info('Test message.');

  $messageItems = $messages.children();
  t.equals($messageItems.length, 2, 'message display shows 2 messages');
  t.equals($($messageItems[1]).text(), 'Test message.',
    'message displays message text');
  t.end();
  cleanDom();
});

//TODO(rosswang): find a better way. If we settle on this, restore afterwards
function failOnError(t) {
  console.error = function(err) {
    t.error(err);
  };
}

function handleMarkerMapSet(map, old) {
  if (map) {
    map.markers.add(this);
  }
  if (old) {
    old.markers.delete(this);
  }
}

mockMaps.onNewMarker = function(marker) {
  marker.onMapChange.add(handleMarkerMapSet);
  handleMarkerMapSet.call(marker, marker.getMap());
};

function startInstance(t, testCase, opts, user) {
  return new Promise(function(resolve, reject) {
    testCase.$domRoot = newDomRoot();

    mockMaps.onNewMap = function(map) {
      testCase.map = map;
      map.markers = new Set();
    };

    var vanadiumWrapper = mockVanadiumWrapper.newInstance();
    var syncbase = uuid.v4();

    var travel = testCase.travel = new Travel($.extend({
      maps: mockMaps,
      vanadiumWrapper: vanadiumWrapper,
      syncbase: syncbase,
      domRoot: testCase.$domRoot[0]
    }, opts));

    var syncbaseStarted;

    vanadiumWrapper.finishInit({
      accountName: 'dev.v.io/u/' + user + '@foogle.com/chrome'
    }, function(endpoint) {
      if (endpoint === syncbase) {
        syncbaseStarted = true;
        return Promise.resolve(new MockSyncbaseWrapper());
      } else {
        return Promise.resolve();
      }
    });

    setTimeout(afterSInit, UI_SLA);

    function afterSInit() {
      t.assert(syncbaseStarted, 'syncbase started');

      var $messages = $('.messages ul').children();
      t.equals($($messages[0]).text(), 'Connected to all services.',
        'all services connected');

      resolve(travel);
    }
  });
}

function startWithGeo(t, testCase, user, origin) {
  return new Promise(function(resolve, reject) {
    var mockNavigator = new MockNavigator();

    var travel = startInstance(t, testCase, { navigator: mockNavigator }, user)
    .then(function() {
      mockNavigator.geolocation.resolvePosition({
        coords: origin.coords
      });

      setTimeout(afterLocate, UI_SLA);
    }).catch(reject);

    function afterLocate() {
      resolve(travel);
    }
  });
}

var instances = {
  alice: {
    d1: {}, //desktop 1
    d2: {},
    d3: {}
  },

  bob: {
    d1: {},
    d2: {}
  }
};

var ad1 = instances.alice.d1;
var ad2 = instances.alice.d2;
var ad3 = instances.alice.d3;
var bd1 = instances.bob.d1;
var bd2 = instances.bob.d2;

test('startup', function(t) {
  failOnError(t);

  timeoutify(startWithGeo(t, ad1, 'alice', PLACES.GOLDEN_GATE)
  .then(function() {
    t.equal(ad1.map.markers.size, 1, 'one marker');

    t.equal(ad1.map.markers.values().next().value.getPlace().placeId,
      PLACES.GOLDEN_GATE.placeId, 'marker set to current location');
    t.comment('waiting to verify stable state');
  }), t, afterStable, STABLE_SLA);

  function afterStable() {
    t.end();
  }
});

function timeoutify(promise, t, callback, delay) {
  promise.then(function() {
    setTimeout(callback, delay);
  }, function(err) {
    t.error(err);
    t.end();
  });
}

function simplifyPlace(p) {
  return {
    lat: p.location.lat(),
    lng: p.location.lng(),
    id: p.placeId
  };
}

function assertSameSingletonMarkers(t, instanceA, instanceB) {
  var p1 = instanceA.map.markers.values().next().value.getPlace();
  var p2 = instanceB.map.markers.values().next().value.getPlace();
  t.deepEqual(simplifyPlace(p2), simplifyPlace(p1), 'markers synced');
}

test('two devices', function(t) {
  failOnError(t);

  timeoutify(startWithGeo(t, ad2, 'alice', PLACES.SPACE_NEEDLE),
    t, afterSync, SYNC_SLA);

  function afterSync() {
    t.equal(ad2.map.markers.size, 1, 'still 1 marker after sync');
    assertSameSingletonMarkers(t, ad1, ad2);
    t.equal(ad2.travel.getActiveTripId(), ad1.travel.getActiveTripId(),
      'trips synced');
    t.end();
  }
});

function addDestination(t, instance, data) {
  return new Promise(function(resolve, reject) {
    var oldMarkerCount = instance.map.markers.size;

    instance.$domRoot.find('.mini-search .add-bn').click();
    setTimeout(afterClick, UI_SLA);

    function afterClick() {
      var $inputs = instance.$domRoot.find('.mini-search input');
      var $focused = $inputs.filter(':focus');
      t.ok($focused.length, 'mini-search input focused');

      /* Actually, the wrong input will be focused because the code focuses on
       * the :visible one, which requires CSS that we're not importing at test
       * time. */
      $inputs.data('mockResults')([data]);

      t.equal(instance.map.markers.size, oldMarkerCount + 1, 'new marker');

      resolve();
    }
  });
}

test('new destination', function(t) {
  failOnError(t);

  timeoutify(addDestination(t, ad1, PLACES.GATEWAY_ARCH),
    t, afterSync, SYNC_SLA);

  function afterSync() {
    t.equal(ad2.map.markers.size, 2, 'new marker on synced instance');

    t.end();
  }
});

test('third device (established trip on other two)', function(t) {
  failOnError(t);

  timeoutify(startInstance(t, ad3, {}, 'alice').then(function() {
    t.comment('waiting to verify stable state');
  }), t, afterSync, STABLE_SLA);

  function afterSync() {
    t.equal(ad3.map.markers.size, 2, 'two markers on synced instance');
    t.end();
  }
});

test('new user', function(t) {
  failOnError(t);

  timeoutify(Promise.all([
    startWithGeo(t, bd1, 'bob', PLACES.GOLDEN_GATE),
    startWithGeo(t, bd2, 'bob', PLACES.SPACE_NEEDLE)
  ]), t, afterSync, SYNC_SLA);

  function afterSync() {
    t.equal(bd1.map.markers.size, 1, 'one marker (no sync with Alice)');
    assertSameSingletonMarkers(t, bd1, bd2);
    t.end();
  }
});

function getMessage(instance, index) {
  var $messageItems = instance.$domRoot.find('.messages ul').children();
  if (index < 0) {
    index = $messageItems.length + index;
  }
  return $($messageItems[index]);
}

function invite(senderInstance, recipientUser) {
  senderInstance.$domRoot.find('.send input')
    .prop('value', '/invite ' + recipientUser + '@foogle.com')
    .trigger(new $.Event('keydown', { which: 13 }));
}

test('join established trip', function(t) {
  failOnError(t);

  invite(ad2, 'bob');

  t.equal(getMessage(ad2, 1).text(),
    'Inviting bob@foogle.com to join the trip...',
    'local invite message');

  setTimeout(afterInvite1, SYNC_SLA);

  var $invite;

  function afterInvite1() {
    $.each(instances.alice, function() {
      t.equal(getMessage(this, -1).find('.text').text(),
        'alice@foogle.com invited bob@foogle.com to join the trip.',
        'trip invite message');
    });

    $.each(instances.bob, function() {
      t.equal(getMessage(this, -1).find('.text').text(),
        'alice@foogle.com has invited you to join a trip. Accept / Decline',
        'recipient invite message');
    });

    t.equal(bd1.map.markers.size, 1, 'still no sync with Alice');

    $invite = getMessage(bd1, -1);
    $invite.find('a[name=decline]').click();

    setTimeout(afterDecline, UI_SLA);
  }

  function afterDecline() {
    t.equal($invite.text(),
      'Declined invite from alice@foogle.com to join a trip.',
      'local decline message');

    setTimeout(afterDeclineSync, SYNC_SLA);
  }

  function afterDeclineSync() {
    t.equal(getMessage(bd2, -1).text(),
      'alice@foogle.com has invited you to join a trip. (Expired)',
      'user decline message');

    invite(ad2, 'bob');

    setTimeout(afterInvite2, SYNC_SLA);
  }

  function afterInvite2() {
    $invite = getMessage(bd2, 2);
    $invite.find('a[name=accept]').click();

    setTimeout(afterAccept, UI_SLA);
  }

  function afterAccept() {
    t.equal($invite.text(),
      'Accepted invite from alice@foogle.com to join a trip.',
      'local accept message');

    setTimeout(afterAcceptSync, SYNC_SLA);
  }

  function afterAcceptSync() {
    t.equal(getMessage(bd1, 2).text(),
      'alice@foogle.com has invited you to join a trip. (Expired)',
      'user accept message');

    $.each(instances.bob, function() {
      t.equal(this.map.markers.size, 2, 'synced with Alice');
    });

    t.end();
  }
});

test('new destination from collaborator', function(t) {
  failOnError(t);

  timeoutify(addDestination(t, bd1, PLACES.GRAND_CANYON),
    t, afterSync, SYNC_SLA);

  function afterSync() {
    $.each(['alice', 'bob'], function() {
      $.each(instances[this], function() {
        t.equal(this.map.markers.size, 3,
          'destination added to all synced instances');
      });
    });

    t.end();
  }
});

test('teardown', function(t) {
  t.end();
  process.exit(); //required to terminate timeouts
});
