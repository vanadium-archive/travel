var test = require('tape');

var $ = require('../../src/util/jquery');
var defineClass = require('../../src/util/define-class');

var Maps = require('../../src/components/maps');
var message = require ('../../src/components/message');

var mockMaps = require('../../mocks/google-maps');

test('message display', function(t) {
  var maps = new Maps(mockMaps);
  
  var $messages = $('.messages', maps.$);
  t.ok($messages.length, 'message display exists');
  t.equals($messages.children().length, 0, 'message display is empty');
  
  maps.message(message.info('Test message.'));
  
  var $messageItem = $messages.children();
  t.equals($messageItem.length, 1, 'message display shows 1 message');
  t.equals($messageItem.text(), 'Test message.',
    'message displays message text');
    
  t.end();
});

module.exports = mockMaps;