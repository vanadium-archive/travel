var $ = require('./util/jquery');

var vanadiumDefault = require('vanadium');
var defineClass = require('./util/define-class');

var VanadiumWrapper = defineClass({
  init: function(runtime) {
    this.runtime = runtime;
    runtime.on('crash', this.crash);
  },
  
  publics: {
    getAccountName: function() {
      return this.runtime.accountName;
    },
    
    /**
     * @param endpoint Vanadium name
     * @returns a promise resolving to a client or rejecting with an error.
     */
    client: function(endpoint) {
      var client = this.runtime.newClient();
      var async = $.Deferred();
      client.bindTo(this.runtime.getContext(), endpoint, function(err, client) {
        if (err)
          async.reject(err);
        else
          async.resolve(client);
      });
      
      return async.promise();
    },
    
    /**
     * @param endpoint Vanadium name
     * @param server object implementing server APIs
     * @returns a promise resolving to void or rejecting with an error.
     */
    server: function(endpoint, server, callback) {
      var async = $.Deferred();
      this.runtime.newServer().serve(endpoint, server, function(err) {
        if (err)
          async.reject(err);
        else
          async.resolve();
      });
      return async.promise();
    }
  },
  
  events: {
    crash: 'memory'
  }
});

module.exports = {
  /**
   * @param vanadium optional vanadium override
   * @returns a promise resolving to a VanadiumWrapper or rejecting with an error.
   */
  init: function(vanadium) {
    vanadium = vanadium || vanadiumDefault;

    var config = {
      logLevel: vanadium.vlog.levels.INFO,
      appName: 'Google Travel'
    };
    
    var async = $.Deferred();
    
    vanadium.init(config, function(err, runtime) {
      if (err)
        async.reject(err);
      else
        async.resolve(new VanadiumWrapper(runtime));
    });
    
    return async.promise();
  }
};
