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
  testInstance.stringQueried.add(function(value) {
    t.equal(value, 'world', 'event argument');
    queried++;
  });
  testInstance.stringQueriedOnce.add(function(value) {
    t.equal(value, 'world', 'event argument');
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
