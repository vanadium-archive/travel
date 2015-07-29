var $ = require('../util/jquery');
var defineClass = require('../util/define-class');

/**
 * Given a Maps API address_components array, return an array of formatted
 * address lines.
 *
 * TODO(rosswang): Is this really the best way?
 */
function formatAddress(details) {
  //some maps API members are lower_underscore
  /* jshint camelcase: false */
  var addr = details && details.formatted_address;
  /* jshint camelcase: true */
  if (!addr) {
    return [];
  }

  var parts = addr.split(', ');
  switch (parts.length) {
    case 1:
      return [addr];
    case 2:
      return parts.join(', ');
    case 3:
      return parts[0] === details.name?
        [parts[1] + ', ' + parts[2]] : [parts[0] + ', ' + parts[1]];
    case 4:
      var line1 = parts[0];
      var line2 = parts[1] + ', ' + parts[2];
      return line1 === details.name? [line2] : [line1, line2];
    default:
      return parts;
  }
}

function render(details) {
  var $info = $('<div>').addClass('destination-info');

  if (details && details.name) {
    $info.append($('<div>')
      .addClass('title')
      .text(details.name));
  }

  var addressLines = formatAddress(details);
  if (addressLines) {
    $.each(addressLines,
      function(i, line) {
        $info.append($('<div>')
          .addClass('address-line')
          .text(line));
      });
  }

  return $info[0];
}

var DestinationInfo = defineClass({
  publics: {
    close: function() {
      this.infoWindow.close();
    },

    show: function(marker) {
      this.infoWindow.open(this.map, marker);
    },

    setDetails: function(details) {
      this.infoWindow.setContent(render(details));
      this.infoWindow.setPosition(details && details.geometry.location);
    }
  },

  init: function(maps, map, details) {
    this.map = map;

    this.infoWindow = new maps.InfoWindow({
      content: render(details),
      position: details && details.geometry.location
    });
  }
});

module.exports = DestinationInfo;
