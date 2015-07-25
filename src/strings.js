function getStrings(locale) {
  return {
    'Destination': 'Destination',
    destination: function(n) {
      return 'Destination ' + n;
    },
    'Origin': 'Origin',
    'Travel Planner': 'Travel Planner'
  };
}

getStrings.currentLocale = getStrings();

module.exports = getStrings;