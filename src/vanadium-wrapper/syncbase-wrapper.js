// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var promisify = require('es6-promisify');
var syncbase = require('syncbase');

var defineClass = require('../util/define-class');

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

/**
 * Translate Syncbase hierarchical keys to object structure for easier
 * processing. '.' is chosen as the separator; '/' is reserved in Syncbase.
 */
function recursiveSet(root, key, value) {
  var matches = /\.?([^\.]*)(.*)/.exec(key);
  var member = matches[1];
  var remaining = matches[2];

  if (remaining) {
    var child = root[member];
    if (!child) {
      child = root[member] = {};
    }
    recursiveSet(child, remaining, value);
  } else {
    root[member] = value;
  }
}

var SyncbaseWrapper = defineClass({
  statics: {
    start: function(context, mountName) {
      var service = syncbase.newService(mountName);
      var app = service.app('travel');
      var db = app.noSqlDatabase('db');

      return setUp(context, app, db).then(function() {
        return new SyncbaseWrapper(context, db);
      });
    }
  },

  publics: {
    refresh: function() {
      var self = this;
      var isHeader = true;

      var query = 'select k, v from t';
      var newData = {};
      this.db.exec(this.context, query, function(err) {
        if (err) {
          self.onError(err);
        } else {
          self.data = newData;
          self.onUpdate(newData);
        }
      }).on('data', function(row) {
        if (isHeader) {
          isHeader = false;
        } else {
          recursiveSet(newData, row[0], row[1]);
        }
      }).on('error', function(err) {
        self.onError(err);
      });
    }
  },

  events: {
    onError: 'memory',
    onUpdate: 'memory'
  },

  init: function(context, db) {
    var self = this;
    this.context = context;
    this.db = db;
    this.data = {};

    // Start the watch loop to periodically poll for changes from sync.
    // TODO(rosswang): Remove this once we have client watch.
    this.watchLoop = function() {
      self.refresh();
      setTimeout(self.watchLoop, 500);
    };
    process.nextTick(self.watchLoop);
  }
});

module.exports = SyncbaseWrapper;
