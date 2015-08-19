// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var $ = require('../src/util/jquery');
var defineClass = require('../src/util/define-class');

//All periods are expressed in milliseconds.
var SYNC_LOOP_PERIOD = 50;
var WATCH_LOOP_PERIOD = 50;

var syncgroups = {};

function update(a, b) {
  $.each(a, function(k, v) {
    if (k !== 'value' && k !== 'version') {
      var bv = b[k];
      if (bv) {
        update(v, bv);
      } else {
        b[k] = $.extend(true, {}, v);
      }
    }
  });

  if (a.version > b.version) {
    b.value = a.value;
    b.version = a.version;
  }
}

function sync(a, b, prefixes) {
  $.each(prefixes, function() {
    var suba = recursiveGet(a, this);
    var subb = recursiveGet(b, this);

    if (suba && subb) {
      update(suba, subb);
      update(subb, suba);
    } else if (!suba) {
      recursiveCopy(a, this, subb);
    } else if (!subb) {
      recursiveCopy(b, this, suba);
    }
  });
}

function syncLoop() {
  $.each(syncgroups, function() {
    var prev;
    this.forEach(function(sb) {
      if (prev) {
        sync(prev, sb, this.prefixes);
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
  $.each(key, function() {
    var child = node[this];
    if (!child) {
      child = node[this] = {};
    }
    node = child;
  });

  return node;
}

function recursiveSet(node, key, value) {
  node = recursiveCreate(node, key);

  node.value = value;
  advanceVersion(node);
}

function recursiveCopy(node, key, content) {
  $.extend(true, recursiveCreate(node, key), content);
}

function recursiveGet(node, key) {
  $.each(key, function() {
    if (!node) {
      return false;
    }
    node = node[this];
  });
  return node;
}

function recursiveDelete(node, key) {
  if (key) {
    node = recursiveGet(node, key);
  }

  if (node) {
    delete node.value;
    advanceVersion(node);
    $.each(node, function(key, value) {
      if (key !== 'version') {
        recursiveDelete(value);
      }
    });
  }
}

function extractData(repo) {
  var data;
  $.each(repo, function(k, v) {
    if (k === 'value') {
      if (typeof data === 'object') {
        if (v !== undefined) {
          data._ = v;
        }
      } else {
        data = v;
      }
    } else if (k !== 'version') {
      var value = extractData(v);
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
     * instances. This is actually based on the size of the SyncGroups with the
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
      return Promise.resolve();
    },

    delete: function(k) {
      recursiveDelete(this.repo, k);
      return Promise.resolve();
    },

    getData: function() {
      return extractData(this.repo) || {};
    },

    syncGroup: function(sgAdmin, name) {
      var repo = this.repo;

      var sgp = {
        buildSpec: function(prefixes) {
          return prefixes;
        },

        join: function() {
          var sgKey = sgAdmin + '$' + name;
          var sg = syncgroups[sgKey];
          sg.add(repo);
          return Promise.resolve(sgp);
        },

        joinOrCreate: function(spec) {
          var sgKey = sgAdmin + '$' + name;
          var sg = syncgroups[sgKey];
          if (!sg) {
            sg = syncgroups[sgKey] = new Set();
          }

          sg.prefixes = spec;
          sg.add(repo);

          return Promise.resolve(sgp);
        }
      };

      return sgp;
    },

    refresh: function() {
      this.onUpdate(this.getData());
    }
  },

  events: {
    onError: 'memory',
    onUpdate: 'memory'
  },

  init: function() {
    var self = this;

    this.repo = {};

    function watchLoop() {
      self.refresh();
      setTimeout(watchLoop, WATCH_LOOP_PERIOD);
    }
    process.nextTick(watchLoop);
  }
});

module.exports = MockSyncbaseWrapper;
