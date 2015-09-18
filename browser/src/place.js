// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

require('es6-shim');

var defineClass = require('./util/define-class');

var Place = defineClass({
  statics: {
    /**
     * @param dependencies {placesService, maps}
     * @param obj the plain object representation of the place
     */
    fromObject: function(dependencies, obj) {
      return new Promise(function(resolve, reject) {
        if (obj.placeId) {
          dependencies.placesService.getDetails(obj, function(place, status) {
            if (status === dependencies.maps.places.PlacesServiceStatus.OK) {
              resolve(new Place(place));
            } else {
              reject(status);
            }
          });
        } else {
          reject('Deserialization not supported.'); //TODO(rosswang)
        }
      });
    },

    equal: function(a, b) {
      return a === b || a && b && a.toKey() === b.toKey();
    }
  },

  publics: {
    getDetails: function() {
      return this.details;
    },

    hasDetails: function() {
      return !!this.details;
    },

    getGeometry: function() {
      return this.details && this.details.geometry || {
        location: this.getLocation()
      };
    },

    getLocation: function() {
      return this.placeObj.location;
    },

    getName: function() {
      var details = this.details;
      return details && details.name ||
        /[^,]*/.exec(details['formatted_address'])[0];
    },

    getPlaceObject: function() {
      return this.placeObj;
    },

    getSingleLine: function() {
      var details = this.details;

      if (this.singleLine) {
        return this.singleLine;

      } else if (details) {
        this.singleLine = details.name &&
          details.name !== details['formatted_address'].split(', ')[0]?
            details.name + ', ' + details['formatted_address'] :
            details['formatted_address'];
        return this.singleLine;

      } else { // not preferred
        return this.placeObj.query || this.placeObj.location.toString();
      }
    },

    /**
     * This code is highly fragile and heaven help the poor soul who needs to
     * localize it.
     *
     * TODO(rosswang): Is this really the best way? We should find a formatter.
     *
     * @param name optional place name to omit from the address. Defaults to the
     *   name in the details; pass null to override.
     * @return an array of formatted address lines.
     */
    getMultiLine: function(name) {
      var details = this.details;

      var addr = details && details['formatted_address'];
      if (!addr) {
        return [];
      }

      if (name === undefined) {
        name = details.name;
      }

      /* If at any point the first line/atom will echo the place name, leave it
       * out. */

      var parts = addr.split(', ');
      var lines = (function() {
        switch (parts.length) {
          case 2:
            // ex. WA, USA => WA, USA
            return [parts.join(', ')];
          case 3:
            // ex. Seattle, WA, USA => Seattle, WA || WA, USA
            // (if Seattle was the search query, format as if it were WA, USA)
            return parts[0] === name?
              [parts[1] + ', ' + parts[2]] : [parts[0] + ', ' + parts[1]];
          case 4: {
            /* ex. Amphitheatre Pkwy, Mountain View, CA 94043, USA:
             *
             * Amphitheatre Pkwy
             * Mountain View, CA 94043
             */
            return [parts[0], parts[1] + ', ' + parts[2]];
          }
          case 5: {
            /* ex. Fort Mason, 2 Marina Blvd, San Francisco, CA 94123, USA
             *
             * Fort Mason
             * 2 Marina Blvd
             * San Francisco, CA 94123
             */
            return [parts[0], parts[1], parts[2] + ', ' + parts[3]];
          }
          case 6: {
            /* ex. A, Fort Mason, 2 Marina Blvd, San Francisco, CA 94123, USA
             *
             * A, Fort Mason
             * 2 Marina Blvd
             * San Francisco, CA 94123
             */
            return [
              parts[0] + ', ' + parts[1],
              parts[2],
              parts[3] + ', ' + parts[4]
            ];
          }
          default:
            return parts;
        }
      })();

      return lines[0] === name? lines.slice(1) : lines;
    },

    /**
     * Returns a plain object that can be used to reconstruct the place. This
     * object really shouldn't be mutated.
     */
    toObject: function() {
      if (this.placeObj.placeId) {
        return {
          placeId: this.placeObj.placeId
        };
      } else {
        return {
          location: {
            lat: this.placeObj.location.lat(),
            lng: this.placeObj.location.lng()
          },
          query: this.placeObj.query
        };
      }
    },

    toKey: function() {
      return this.placeObj.placeId ||
        (this.placeObj.query || '') + this.placeObj.location.toString();
    }
  },

  /**
   * @param desc place object, place details result, or search result.
   *
   * TODO(rosswang): lazy fetch details if not given.
   */
  init: function(desc) {
    if (desc.geometry) {
      var placeObj = this.placeObj = { location: desc.geometry.location };
      this.details = desc;

      if (desc['place_id'] !== undefined) {
        placeObj.placeId = desc['place_id'];
      } else {
        placeObj.query = desc['formatted_address'];
      }
    } else {
      this.placeObj = desc;
    }
  }
});

module.exports = Place;