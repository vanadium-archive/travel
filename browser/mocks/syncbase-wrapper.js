// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var verror = require('vanadium').verror;

var $ = require('../src/util/jquery');
var defineClass = require('../src/util/define-class');

//All periods are expressed in milliseconds.
var SYNC_LOOP_PERIOD = 25;
var WATCH_LOOP_PERIOD = 25;

var syncgroups = {};

function updateWatchers(watchers, k, v) {
  if (watchers) {
    watchers.forEach(function(watcher) {
      watcher.update(k, v);
    });
  }
}

function concatWatchers(a, b) {
  if (!a) {
    return b;
  } else if (!b) {
    return a;
  }
  return a.concat(b);
}

function update(a, b, key, parentWatchers) {
  var watchers = concatWatchers(parentWatchers, b.watchers);
  $.each(a, function(k, v) {
    if (k !== 'value' && k !== 'version' && k !== 'watchers') {
      var bv = b[k];
      if (!bv) {
        bv = b[k] = {};
      }
      update(v, bv, key.concat(k), watchers);
    }
  });

  if (a.version > b.version ||
      a.version !== undefined && b.version === undefined ||
      a.version === b.version && a.value !== b.value /* initial diff */) {
    b.value = a.value;
    b.version = a.version;
    updateWatchers(watchers, key, b.value);
  }
}

function sync(a, b, prefixes) {
  $.each(prefixes, function() {
    var suba = recursiveCreate(a, this);
    var subb = recursiveCreate(b, this);

    update(suba.node, subb.node, this, subb.parentWatchers);
    update(subb.node, suba.node, this, suba.parentWatchers);
  });

  a.endBatch();
  b.endBatch();
}

function syncLoop() {
  $.each(syncgroups, function(i, sg) {
    var prev;
    sg.forEach(function(sb) {
      if (prev) {
        sync(prev, sb, sg.prefixes);
      }

      prev = sb;
    }, this);
  });

  setTimeout(syncLoop, SYNC_LOOP_PERIOD);
}
process.nextTick(syncLoop);

function advanceVersion(node) {
  if (node.version === undefined) {
    node.version = 0;
  } else {
    node.version++;
  }
}

function recursiveCreate(node, key) { //it's recursive in spirit
  var parentWatchers;
  $.each(key, function() {
    parentWatchers = concatWatchers(parentWatchers, node.watchers);
    var child = node[this];
    if (!child) {
      child = node[this] = {};
    }
    node = child;
  });

  return {
    node: node,
    parentWatchers: parentWatchers
  };
}

function recursiveSet(node, key, value) {
  var target = recursiveCreate(node, key);

  target.node.value = value;
  advanceVersion(target.node);
  updateWatchers(
    concatWatchers(target.parentWatchers, node.watchers), key, value);
}

function recursiveGet(node, key, parentWatchers) {
  $.each(key, function() {
    if (!node) {
      return false;
    }
    parentWatchers = concatWatchers(parentWatchers, node.watchers);
    node = node[this];
  });
  return {
    node: node,
    parentWatchers: parentWatchers
  };
}

function recursiveDelete(node, key, parentWatchers) {
  parentWatchers = parentWatchers || [];
  if (key) {
    var target = recursiveGet(node, key, parentWatchers);
    node = target.node;
    parentWatchers = target.parentWatchers;
  }

  if (node) {
    var watchers = concatWatchers(parentWatchers, node.watchers);

    if (node.value !== undefined) {
      delete node.value;
      advanceVersion(node);
      updateWatchers(watchers, key);
    } else {
      advanceVersion(node);
    }
    $.each(node, function(key, value) {
      if (key !== 'version' && key !== 'watchers') {
        recursiveDelete(value, null, watchers);
      }
    });
  }
}

function extractData(repo, onData, fullKey) {
  var data;
  fullKey = fullKey || [];
  $.each(repo, function(k, v) {
    if (k === 'value') {
      if (v !== undefined) {
        if (typeof data === 'object') {
          data._ = v;
        } else {
          data = v;
        }
        if (onData) {
          onData(fullKey, v);
        }
      }
    } else if (k !== 'version' && k !== 'watchers') {
      var value = extractData(v, onData, fullKey.concat(k));
      if (value !== undefined) {
        if (data === undefined) {
          data = {};
        } else if (typeof data !== 'object') {
          data = { _: data };
        }
        data[k] = value;
      }
    }
  });

  return data;
}

var MockSyncbaseWrapper = defineClass({
  statics: {
    /**
     * SLA for a write to a mocked Syncbase instance to be reflected by synced
     * instances. This is actually based on the size of the syncgroups with the
     * current mock implementation--roughly n * SYNC_LOOP_SLA--but let's express
     * it as a constant for simplicity.
     */
    SYNC_SLA: 250 //ms
  },

  publics: {
    batch: function(fn) {
      var ops = {
        put: this.put,
        delete: this.delete
      };

      fn.call(ops, ops);
      return Promise.resolve();
    },

    put: function(k, v) {
      recursiveSet(this.repo, k, v);
      this.repo.endBatch();
      return Promise.resolve();
    },

    delete: function(k) {
      recursiveDelete(this.repo, k);
      this.repo.endBatch();
      return Promise.resolve();
    },

    // TODO(rosswang): transitional
    getData: function() {
      return extractData(this.repo) || {};
    },
    // TODO(rosswang): end transitional

    syncgroup: function(sgAdmin, name) {
      var repo = this.repo;
      var sgp;

      function sgFactory(spec) {
        return function() {
          var sg = new Set();
          sg.prefixes = spec;
          return sg;
        };
      }

      function errNoExist() {
        return new verror.NoExistError(null, 'Syncgroup does not exist.');
      }

      function getSg() {
        return syncgroups[sgAdmin + '$' + name];
      }

      function joinSg(factory) {
        var sgKey = sgAdmin + '$' + name;
        var sg = syncgroups[sgKey];
        if (!sg) {
          sg = syncgroups[sgKey] = factory();
        }
        sg.add(repo);

        return Promise.resolve(sgp);
      }

      sgp = {
        buildSpec: function(prefixes) {
          return prefixes;
        },

        changeSpec: function(){
          return getSg()? Promise.resolve() : Promise.reject(errNoExist());
        },

        join: function() {
          return joinSg(function() {
            throw errNoExist();
          });
        },

        createOrJoin: function(spec) {
          return joinSg(sgFactory(spec));
        },

        joinOrCreate: function(spec) {
          return joinSg(sgFactory(spec));
        }
      };

      return sgp;
    },

    getRawWatched: function(prefix, pullHandler, streamHandler) {
      var target = recursiveCreate(this.repo, prefix);
      extractData(target.node, pullHandler.onData, prefix);
      this.registerHandlers(target.node, streamHandler);
      return Promise.resolve();
    },

    // TODO(rosswang): transitional
    refresh: function() {
      this.onUpdate(this.getData());
    }
    // TODO(rosswang): end transitional
  },

  privates: {
    watcher: defineClass.innerClass({
      publics: {
        update: function(k, v) {
          this.dispatchLast(true);
          this.lastOp = {
            key: k,
            value: v
          };
          this.outer.opBatch.add(this.ifc);
        },

        endBatch: function() {
          if (this.dispatchLast(false) && this.streamHandler.onBatchEnd) {
            try {
              this.streamHandler.onBatchEnd();
            } catch (err) {
              this.streamHandler.onError(err);
            }
          }
        }
      },

      privates: {
        dispatchLast: function(continued) {
          if (this.lastOp) {
            try {
              if (this.lastOp.value === undefined) {
                if (this.streamHandler.onDelete) {
                  this.streamHandler.onDelete(this.lastOp.key, continued);
                }
              } else {
                if (this.streamHandler.onPut) {
                  this.streamHandler.onPut(
                    this.lastOp.key, this.lastOp.value, continued);
                }
              }
            } catch (err) {
              this.streamHandler.onError(err);
            }
            return true;
          } else {
            return false;
          }
        }
      },

      init: function(streamHandler) {
        this.streamHandler = streamHandler;
      }
    }),

    registerHandlers: function(node, streamHandler) {
      var watcher = this.watcher(streamHandler);

      if (node.watchers) {
        node.watchers.push(watcher);
      } else {
        node.watchers = [watcher];
      }
    }
  },

  // TODO(rosswang): transitional
  events: {
    onError: 'memory',
    onUpdate: 'memory'
  },
  // TODO(rosswang): end transitional

  init: function() {
    var self = this;

    var opBatch = this.opBatch = new Set();

    this.repo = {
      endBatch: function() {
        opBatch.forEach(function(watcher) {
          watcher.endBatch();
        });
        opBatch.clear();
      }
    };

    // TODO(rosswang): transitional
    function watchLoop() {
      self.refresh();
      setTimeout(watchLoop, WATCH_LOOP_PERIOD);
    }
    process.nextTick(watchLoop);
    // TODO(rosswang): end transitional
  }
});

module.exports = MockSyncbaseWrapper;
