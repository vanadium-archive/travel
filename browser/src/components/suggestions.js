// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var _ = require('lodash');
var hg = require('mercury');
var h = hg.h;

var Suggestion = require('./suggestion');

module.exports = Suggestions;

function Suggestions(suggestions) {
  return hg.state({
    suggestions: hg.varhash(suggestions || {}, Suggestion)
  });
}

Suggestions.render = function(state) {
  return h('.suggestions', _.toArray(state.suggestions).map(
    function(suggestion) {
      return hg.partial(Suggestion.render, suggestion);
    }));
};