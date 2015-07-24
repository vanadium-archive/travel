var test = require('tape');

var TravelSync = require('../src/travelsync');

test('init', function(t) {
  t.ok(new TravelSync(), 'initializes');
  t.end();
});