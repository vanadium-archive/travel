var global = require('global');

/**
 * Global variable exports for console debug.
 */
module.exports = function(app) {
  global.travel = app;
};