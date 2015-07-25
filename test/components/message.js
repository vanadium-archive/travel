var test = require('tape');

var message = require('../../src/components/message');

test('init', function(t) {
  t.ok(new message.Message(), 'default instantiation');
  t.end();
});

test('dom', function(t) {
  var msg = new message.Message(message.info('Hello, world!'));
  t.equal(msg.$.length, 1, 'unique element');
  t.equal(msg.$[0].tagName, 'LI', 'tag name');
  t.assert(msg.$.hasClass('info'), 'class info');
  t.equal(msg.$.text(), 'Hello, world!', 'text');

  msg.setType(message.ERROR);
  t.notOk(msg.$.hasClass('info'), 'class not info');
  t.assert(msg.$.hasClass('error'), 'class error');

  msg.setText('hi');
  t.equal(msg.$.text(), 'hi', 'text update');

  t.end();
});