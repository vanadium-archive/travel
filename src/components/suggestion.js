// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var hg = require('mercury');
var h = hg.h;

var $ = require('../util/jquery');
var strings = require('../strings').currentLocale;

module.exports = Suggestion;

function Suggestion(suggestion) {
  return hg.state({
    placeId: hg.value(suggestion.placeId),
    placeName: hg.value(suggestion.placeName),
    photoUrl: hg.value(suggestion.photoUrl),
    iconUrl: hg.value(suggestion.iconUrl),
    rating: hg.value(suggestion.rating),
    priceLevel: hg.value(suggestion.priceLevel),

    hovered: hg.value(suggestion.hovered),
    selected: hg.value(suggestion.selected),

    channels: {
      toggleSelect: toggleSelect
    }
  });
}

function toggleSelect(state) {
  state.selected.set(!state.selected());
}

Suggestion.render = function(state) {
  var elems = [
    h('.img-container', state.photoUrl? h('img.photo', { src: state.photoUrl })
                      : state.iconUrl ? h('img.icon', { src: state.iconUrl })
                      : ['?']),
    h('.name', state.placeName)
  ];
  if (state.rating !== undefined && state.rating !== null) {
    elems.push(h('.rating', [
      state.rating .toString(),
      'TODO: stars'
    ]));
  }
  if ($.isNumeric(state.priceLevel)) {
    elems.push(h('.price-level', state.priceLevel?
      strings.priceLevelUnit.repeat(state.priceLevel) : strings['Free']));
  }
  elems.push(h('.clear-float'));
  return h('.suggestion', elems);
};