var test = require('tape');

var jquery = require('../../src/util/jquery');

test('load on server', function(t) {
  t.ok(jquery.each, 'jquery has an each function');
  t.end();
});
