// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var test = require('tape');

var $ = require('../../src/util/jquery');
var defineClass = require('../../src/util/define-class');

test('trivial', function(t) {
  var TestClass = defineClass({});
  t.ok(new TestClass(), 'class instantiates');
  t.end();
});

test('defineClass', function(t) {
  var TestClass = defineClass({
    init: function(value) {
      this.value = value;
      this.greeting = 'Hello';
    },
    privates: {
      getMessage: function() {
        return this.greeting + ', ' + this.value + '!';
      }
    },
    publics: {
      toString: function() {
        this.stringQueried(this.value);
        this.stringQueriedOnce(this.value);
        return this.getMessage();
      }
    },
    constants: ['greeting'],
    events: ['stringQueried', {stringQueriedOnce: 'once'}]
  });

  var testInstance = new TestClass('world');

  t.ok(testInstance, 'instance instantiated');

  var queried = 0, queriedOnce = 0;
  t.notOk(testInstance.stringQueried.add(function(value) {
    t.equal(value, 'world', 'event argument');
    queried++;
  }).fire, 'callback accessibility leak');
  t.ok(testInstance.stringQueried.has(), 'callback proxied accessor');
  testInstance.stringQueriedOnce.add(function(value) {
    t.equal(value, 'world', 'event argument');
    t.equal(this, testInstance, 'event context');
    queriedOnce++;
  });

  t.notOk(testInstance.stringQueried.fired(), 'event not fired');

  t.equal(testInstance.greeting, 'Hello', 'public constant accessible');
  t.equal(testInstance.toString(), 'Hello, world!', 'public member accessible');

  t.assert(testInstance.stringQueried.fired(), 'event fired');

  t.equal(queried, 1, 'event fired');
  t.equal(queriedOnce, 1, 'once event fired');

  testInstance.toString();
  t.equal(queried, 2, 'event fired again');
  t.equal(queriedOnce, 1, 'once event not fired again');

  t.notOk(testInstance.getMessage, 'private member not accessible');
  t.notOk(testInstance.value, 'instance field not accessible');
  t.notOk(testInstance.stringQueried.fire, 'event fire not accessible');
  t.notOk(testInstance.stringQueried.fireWith, 'event fireWith not accessible');

  t.end();
});

test('member bindings', function(t) {
  var seen;

  var foreignContext = {
    a: 0
  };

  var TestClass = defineClass({
    publics: {
      seePublic: function() {
        seen = this.a++;
      }
    },
    privates: {
      seePrivate: function() {
        seen = this.a++;
      }
    },
    events: {
      onPrivate: 'public'
    },

    init: function() {
      this.a = 42;
      this.onPrivate.add(this.seePrivate);

      foreignContext.privateEvent = this.onPrivate;
      foreignContext.privatePrivate = this.seePrivate;
      foreignContext.privatePublic = this.seePublic;
    }
  });

  var testInstance = new TestClass();

  foreignContext.publicEvent = testInstance.onPrivate;
  foreignContext.publicPublic = testInstance.seePublic;

  foreignContext.privateEvent();
  t.equal(seen, 42, 'event privately instance-bound');
  foreignContext.privatePrivate();
  t.equal(seen, 43, 'private method privately instance-bound');
  foreignContext.privatePublic();
  t.equal(seen, 44, 'public method privately instance-bound');
  foreignContext.publicEvent();
  t.equal(seen, 45, 'event publicly instance-bound');
  foreignContext.publicPublic();
  t.equal(seen, 46, 'public method publicly instance-bound');

  t.end();
});

test('events object', function(t) {
  var TestClass = defineClass({
    init: function() {
      this.privateFires = this.publicFires = 0;

      var self = this;
      this.privateEvent.add(function() {
        self.privateFires++;
      });
      this.publicEvent.add(function() {
        self.publicFires++;
      });
    },

    publics: {
      getPrivateFires: function() {
        return this.privateFires;
      },

      getPublicFires: function() {
        return this.publicFires;
      },

      trigger: function() {
        this.triggerOnce.fire();
        this.privateEvent();
        this.publicEvent();
      }
    },
    events: {
      triggerOnce: 'once',
      privateEvent: 'private',
      publicEvent: 'public'
    }
  });

  var testInstance = new TestClass();
  var count = 0;
  testInstance.triggerOnce.add(function() {
    count++;
  });

  testInstance.trigger();
  t.equal(count, 1, 'event fired');
  testInstance.trigger();
  t.equal(count, 1, 'event not fired again');

  t.notOk(testInstance.privateEvent, 'private event not accessible');
  t.equal(testInstance.getPrivateFires(), 2, 'private event fired twice');
  t.equal(testInstance.getPublicFires(), 2, 'public event fired twice');

  t.notOk($.isFunction(testInstance.triggerOnce), 'normal event not callable');
  t.ok($.isFunction(testInstance.publicEvent), 'public event callable');
  testInstance.publicEvent();
  t.equal(testInstance.getPublicFires(), 3, 'public event fired thrice');

  t.end();
});

test('statics', function(t) {
  var TestClass = defineClass({
    publics: {
      getValue: function() {
        return this.CONSTANT;
      }
    },

    statics: {
      CONSTANT: 42
    }
  });

  t.equal(TestClass.CONSTANT, 42, 'public static access');

  var testInstance = new TestClass();

  t.equal(testInstance.CONSTANT, 42, 'public access');
  t.equal(testInstance.getValue(), 42, 'private access');

  t.end();
});

test('inner class', function(t) {
  var Outer = defineClass({
    init: function(prefix) {
      this.prefix = prefix;
    },

    publics: {
      inner: defineClass.innerClass({
        init: function(suffix) {
          this.suffix = suffix;
        },

        publics: {
          getString: function() {
            return this.outer.prefix + this.suffix;
          }
        }
      })
    }
  });

  var outer1 = new Outer('Hello, ');
  var inner1x1 = outer1.inner('world!'),
      inner1x2 = outer1.inner('Cleveland!');

  var outer2 = new Outer('Goodnight, ');
  var inner2 = outer2.inner('moon.');

  t.equal(inner1x1.getString(), 'Hello, world!',
    'fields of outer and inner classes not corrupted by other instances');
  t.equal(inner1x2.getString(), 'Hello, Cleveland!',
    'multiple instances of an inner class');
  t.equal(inner2.getString(), 'Goodnight, moon.',
    'multiple instances of an outer class');

  t.end();
});

test('late binding of public members', function(t) {
  var TestClass = defineClass({
    publics: {
      getValue: function() {
        return 'a';
      },
      rebind: function() {
        this.getValue = function() {
          return 'b';
        };
      }
    }
  });
  var testInstance = new TestClass();
  testInstance.rebind();
  t.equal(testInstance.getValue(), 'b',
    'public interface should late-bind to private');
  t.end();
});

test('late binding of event members', function(t) {
  var fireCount = 0;

  function listener() {
    fireCount++;
  }

  var TestClass = defineClass({
    publics: {
      addA: function() {
        this.onA.add(listener);
      },

      a: function() {
        this.onA();
      },

      b: function() {
        this.onB();
      },

      getListenerCount: function() {
        return this.listenerCount;
      }
    },

    events: {
      onA: 'private',
      onB: '',
      onC: 'public'
    },

    init: function() {
      var self = this;
      this.listenerCount = 0;

      function decorateEvent(event) {
        defineClass.decorate(event, 'add', function() {
          self.listenerCount++;
        });
      }

      decorateEvent(this.onA);
      decorateEvent(this.onB);
      decorateEvent(this.onC);
    }
  });

  var testInstance = new TestClass();
  testInstance.addA();
  t.equal(testInstance.getListenerCount(), 1, 'events decorated');
  testInstance.onB.add(listener);
  t.equal(testInstance.getListenerCount(), 2, 'events decorated');
  testInstance.onC.add(listener);
  t.equal(testInstance.getListenerCount(), 3, 'events decorated');
  testInstance.a();
  testInstance.b();
  testInstance.onC();
  t.equal(fireCount, 3, 'events still work');

  t.end();
});
