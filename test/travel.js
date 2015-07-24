var test = require('tape');

var $ = require('../src/util/jquery');
var Travel = require('../src/travel');

var mockMaps = require('../mocks/google-maps');
var mockVanadiumWrapper = require('../mocks/vanadium-wrapper');

function cleanDom() {
  $('body').empty();
}

test('init', function(t) {
  new Travel({
    maps: mockMaps
  });
  t.end();
  cleanDom();
});

test('message display', function(t) {
  var travel = new Travel({
    vanadiumWrapper: mockVanadiumWrapper,
    maps: mockMaps
  });
  
  var $messages = $('.messages');
  t.ok($messages.length, 'message display exists');
  t.equals($messages.children().length, 0, 'message display is empty');
  
  travel.info('Test message.');
  
  var $messageItem = $messages.children();
  t.equals($messageItem.length, 1, 'message display shows 1 message');
  t.equals($messageItem.text(), 'Test message.',
    'message displays message text');
    
  t.end();
  cleanDom();
});

test('domRoot', function(t) {
  var $root = $('<div>');
  var root = $root[0];
  $('body').append($root);
  
  new Travel({
    maps: mockMaps,
    vanadiumWrapper: mockVanadiumWrapper,
    domRoot: root
  });
  
  t.ok($root.children().length, 'app parented to given root');
  
  t.end();
  cleanDom();
});