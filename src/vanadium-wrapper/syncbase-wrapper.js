// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var promisify = require('es6-promisify');
var syncbase = require('syncbase');
var vanadium = require('vanadium');

var defineClass = require('../util/define-class');

var debug = require('../debug');

/**
 * Create app, db, and table structure in Syncbase.
 */
function setUp(context, app, db) {
  function nonfatals(err) {
    switch (err.id) {
      case 'v.io/v23/verror.Exist':
        console.info(err.msg);
        return;
      default:
        throw err;
    }
  }

  //TODO(rosswang) If {} will remain empty, can it be omitted?
  return promisify(app.create.bind(app))(context, {})
    .catch(nonfatals)
    .then(function() {
      return promisify(db.create.bind(db))(context, {});
    })
    .catch(nonfatals)
    .then(function() {
      var table = db.table('t');
      return promisify(table.create.bind(table))(context, {});
    })
    .catch(nonfatals);
}

function joinKey(key) {
  return key.join('.');
}

/**
 * Translate Syncbase hierarchical keys to object structure for easier
 * processing. '.' is chosen as the separator; '/' is reserved in Syncbase.
 *
 * It might be ideal to have the separator configurable, but certain separators
 * need regex escaping.
 */
function recursiveSet(root, key, value) {
  var matches = /\.?([^\.]*)(.*)/.exec(key);
  var member = matches[1];
  var remaining = matches[2];

  if (remaining) {
    var child = root[member];
    if (!child) {
      child = root[member] = {};
    } else if (typeof child !== 'object') {
      child = root[member] = { _: child };
    }

    recursiveSet(child, remaining, value);
  } else {
    var obj = root[member];
    if (obj) {
      obj._ = value;
    } else {
      root[member] = value;
    }
  }
}

var SG_MEMBER_INFO = new syncbase.nosql.SyncGroupMemberInfo();

var SyncbaseWrapper = defineClass({
  statics: {
    start: function(context, mountName) {
      var service = syncbase.newService(mountName);
      var app = service.app('travel');
      var db = app.noSqlDatabase('db');

      return setUp(context, app, db).then(function() {
        return new SyncbaseWrapper(context, db, mountName);
      });
    }
  },

  publics: {
    /**
     * @param seq a function executing the batch operations, receiving as its
     *  `this` context and first parameter the batch operation methods
     *  (put, delete), each of which returns a promise. The callback must return
     *  the overarching promise.
     */
    batch: function(fn){
      var self = this;
      var opts = new syncbase.nosql.BatchOptions();

      return this.manageWrite(this.runInBatch(this.context, this.db, opts,
        function(db, cb) {
          var t = db.table('t');
          var putToSyncbase = promisify(t.put.bind(t));
          var deleteFromSyncbase = promisify(t.delete.bind(t));

          var ops = {
            put: function(k, v) {
              return self.standardPut(putToSyncbase, k, v);
            },
            delete: function(k) {
              return self.standardDelete(deleteFromSyncbase, k);
            }
          };

          var p = fn.call(ops, ops);
          if (p) {
            p.then(function(result) {
              return cb(null, result);
            }, function(err) {
              return cb(err);
            });
          } else {
            cb();
          }
        }));
    },

    /**
     * @param k array of key elements
     * @param v serialized value
     */
    put: function(k, v) {
      return this.manageWrite(this.standardPut(this.putToSyncbase, k, v));
    },

    delete: function(k) {
      return this.manageWrite(this.standardDelete(this.deleteFromSyncbase, k));
    },

    getData: function() {
      return this.data;
    },

    /**
     * Since I/O is asynchronous, sparse, and fast, let's avoid concurrency/
     * merging with the local syncbase instance by only starting a refresh if
     * no writes are in progress and the refresh finishes before any new writes
     * have started. Client watch should help make this better. In any case if
     * this becomes starved, we can be smarter by being sensitive to keys being
     * updated at any given time.
     *
     * We can also get around this problem by restructuring the data flow to
     * be unidirectional with the local Syncbase as the authority, though that
     * introduces (hopefully negligible) latency and complicates forked response
     * on user input for the same data.
     *
     * @returns a void promise for this refresh
     */
    refresh: function() {
      var self = this;

      var current = this.pull.current;
      if (!current) {
        current = this.pull.current = this.pull().then(function(data) {
            self.pull.current = null;
            self.data = data;
            self.onUpdate(data);
            return data;
          }, function(err) {
            self.pull.current = null;
            throw err;
          });
      }

      return current;
    },

    syncGroup: function(sgAdmin, name) {
      var self = this;

      name = vanadium.naming.join(sgAdmin, '$sync', name);
      var sg = this.db.syncGroup(name);

      //syncgroup-promisified
      var sgp;

      function chainable(cb) {
        return function(err) {
          cb(err, sgp);
        };
      }

      var create = promisify(function(spec, cb) {
        debug.log('Syncbase: create syncgroup ' + name);
        sg.create(self.context, spec, SG_MEMBER_INFO, chainable(cb));
      });

      var destroy = promisify(function(cb) {
        debug.log('Syncbase: destroy syncgroup ' + name);
        sg.destroy(self.context, cb);
      });

      var join = promisify(function(cb) {
        debug.log('Syncbase: join syncgroup ' + name);
        sg.join(self.context, SG_MEMBER_INFO, chainable(cb));
      });

      var setSpec = promisify(function(spec, cb) {
          sg.setSpec(self.context, spec, '', chainable(cb));
      });

      /* Be explicit about arg lists because promisify is sensitive to extra
       * args. i.e. even though destroy and join could just be fn refs, since
       * they're made by promisify, wrap them in a fn that actually takes 0
       * args. */
      sgp = {
        buildSpec: function(prefixes, mountTables) {
          return new syncbase.nosql.SyncGroupSpec({
            perms: new Map([
              ['Admin', {in: ['...']}],
              ['Read', {in: ['...']}],
              ['Write', {in: ['...']}],
              ['Resolve', {in: ['...']}],
              ['Debug', {in: ['...']}]
            ]),
            prefixes: prefixes.map(function(p) { return 't:' + joinKey(p); }),
            mountTables: mountTables
          });
        },

        create: function(spec) { return create(spec); },
        destroy: function() { return destroy(); },
        join: function() { return join(); },
        setSpec: function(spec) { return setSpec(spec); },

        createOrJoin: function(spec) {
          return sgp.create(spec)
            .catch(function(err) {
              if (err.id === 'v.io/v23/verror.Exist') {
                debug.log('Syncbase: syncgroup ' + name + ' already exists.');
                return sgp.join()
                  .then(function() {
                    return sgp.setSpec(spec);
                  });
              } else {
                throw err;
              }
            });
        },

        joinOrCreate: function(spec) {
          return sgp.join()
            .then(function() {
              return sgp.setSpec(spec);
            }, function(err) {
              if (err.id === 'v.io/v23/verror.NoExist') {
                debug.log('Syncbase: syncgroup ' + name + ' does not exist.');
                return sgp.createOrJoin(spec);
              } else {
                throw err;
              }
            });
        }
      };

      return sgp;
    }
  },

  privates: {
    manageWrite: function(promise) {
      var writes = this.writes;

      this.dirty = true;
      writes.add(promise);

      return promise.then(function(v) {
        writes.delete(promise);
        return v;
      }, function(err) {
        writes.delete(promise);
        throw err;
      });
    },

    standardPut: function(fn, k, v) {
      k = joinKey(k);
      debug.log('Syncbase: put ' + k + ' = ' + v);
      return fn(this.context, k, v);
    },

    standardDelete: function(fn, k) {
      k = joinKey(k);
      debug.log('Syncbase: delete ' + k);
      return fn(this.context, syncbase.nosql.rowrange.prefix(k));
    },

    /**
     * @see refresh
     */
    pull: function() {
      var self = this;

      if (this.writes.size) {
        debug.log('Syncbase: deferring refresh due to writes in progress');
        return Promise.all(this.writes)
          .then(this.pull, this.pull);

      } else {
        this.dirty = false;

        return new Promise(function(resolve, reject) {
          var newData = {};
          var abort = false;

          var isHeader = true;

          self.db.exec(self.context, 'select k, v from t', function(err) {
            if (err) {
              reject(err);
            } else if (abort) {
              //no-op; promise has already been resolved.
            } else if (self.dirty) {
              debug.log('Syncbase: aborting refresh due to writes');
              resolve(self.pull()); //try/wait for idle again
            } else {
              resolve(newData);
            }
          }).on('data', function(row) {
            if (isHeader) {
              isHeader = false;
              return;
            }

            if (abort) {
              //no-op
            } else if (self.dirty) {
              abort = true;
              debug.log('Syncbase: aborting refresh due to writes');
              resolve(self.pull()); //try/wait for idle again
              /* It would be nice to abort this stream for real, but we can't.
               * Leave this handler attached but no-oping to drain the stream.
               */
            } else {
              recursiveSet(newData, row[0], row[1]);
            }
          }).on('error', reject);
        }).catch(function(err) {
          if (err.id === 'v.io/v23/verror.Internal') {
            console.error(err);
          } else {
            throw err;
          }
        });
      }
    }
  },

  constants: [ 'mountName' ],

  events: {
    onError: 'memory',
    onUpdate: 'memory'
  },

  init: function(context, db, mountName) {
    // TODO(rosswang): mountName probably won't be necessary after SyncGroup
    // admin instances are hosted (see group-manager).
    var self = this;
    this.context = context;
    this.db = db;
    this.t = db.table('t');
    this.mountName = mountName;

    this.writes = new Set();

    this.runInBatch = promisify(syncbase.nosql.runInBatch);
    this.putToSyncbase = promisify(this.t.put.bind(this.t));
    this.deleteFromSyncbase = promisify(this.t.delete.bind(this.t));

    // Start the watch loop to periodically poll for changes from sync.
    // TODO(rosswang): Remove this once we have client watch.
    function watchLoop() {
      if (!self.pull.current) {
        self.refresh().catch(self.onError);
      }
      setTimeout(watchLoop, 500);
    }
    process.nextTick(watchLoop);
  }
});

module.exports = SyncbaseWrapper;
