// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var $ = require('./jquery');

/**
 * <p>Plays a similar role to other npm private encapsulation facilities, but
 * exposes private members on `this` via per-instance bindings. A class
 * definition can contain the following members:
 * <ul>
 *  <li><code>init</code>: constructor/initializer function for an instance. It
 *    will be called when the class is instantiated via <code>new</code>. Fields
 *    can be initialized in this function. Private functions and events can also
 *    be defined within this function.
 *  <li><code>privates</code>: map of private functions or private static
 *    constants, with access to other members via <code>this</code>. These
 *    members are not publicly visible. This is equivalent to associating these
 *    members explicitly within <code>init</code>.
 *  <li><code>publics</code>: map of public functions, with access to other
 *    members via <code>this</code>. These members are publicly visible.
 *  <li><code>constants</code>: list of names of instance constants initialized
 *    in <code>init</code> to be exposed.
 *  <li><code>statics</code>: map of public static constants, accessible from
 *    the private context, the public context, and on the constructor function.
 *  <li><code>events</code>: list of event names, some of which can actually be
 *    a singleton map with the event name and a string of flags, or a map of
 *    event names to flags. Flags are those to
 *    <a href="https://api.jquery.com/jQuery.Callbacks/">jQuery Callbacks</a>,
 *    plus the "private" flag, which hides the event from the public interface
 *    entirely, and the "public" flag, which exposes the event trigger to the
 *    public interface.
 * </ul>
 *
 * <p>Care should be taken not to be tempted to declare instance constants
 * within <code>private</code>, as any instantiations done on the initial
 * values is done at class definition time rather than class instantiation
 * time. (As such, using that mechanism to declare private static constants does
 * work.)
 */
module.exports = defineClass;

function defineClass(def) {
  var constructor = function() {
    var ifc = this;
    var pthis = $.extend({
        ifc: ifc //expose reflexive public interface for private use
      },
      //extend in inverse precedence
      def.statics, def.publics, def.privates);

    if (def.events) {
      if ($.isArray(def.events)) {
        $.each(def.events, function(i, event) {
          if ($.type(event) === 'string') {
            defineEvent(pthis, ifc, event);
          } else {
            defineEventsFromObject(pthis, ifc, event);
          }
        });
      } else {
        defineEventsFromObject(pthis, ifc, def.events);
      }
    }

    if (def.statics) {
      $.extend(ifc, def.statics);
    }

    if (def.init) {
      def.init.apply(pthis, arguments);
    }

    if (def.publics) {
      polyProxy(ifc, pthis, def.publics, true);
    }

    if (def.constants) {
      $.each(def.constants, function(i, constant) {
        ifc[constant] = pthis[constant];
      });
    }
  };

  if (def.statics) {
    $.extend(constructor, def.statics);
  }

  return constructor;
}

defineClass.innerClass = function(def) {
  var init = def.init;
  def.init = function(outer, constructorArgs) {
    this.outer = outer;
    init.apply(this, constructorArgs);
  };

  var InnerClass = defineClass(def);
  return function() {
    return new InnerClass(this, arguments);
  };
};

/**
 * Decorates a member function with a like-signatured function to be called
 * prior to the main invocation.
 */
defineClass.decorate = function(context, name, before)  {
  var proto = context[name];
  context[name] = function() {
    before.apply(context, arguments);
    return proto.apply(context, arguments);
  };
};

/**
 * Late-bind proxies to maximize flexibility at negligible performance cost.
 * However, a word of caution: although normal jQuery proxies are identifiable
 * as equivalent to their originals for the purposes of callback binding, these
 * will not be.
 */
function lateProxy(context, name) {
  return function() {
    return context[name].apply(context, arguments);
  };
}

function polyProxy(proxy, context, members, lateBinding) {
  $.each(members, $.isArray(members)?
    function() {
      proxy[this] =
        lateBinding? lateProxy(context, this) : $.proxy(context, this);
    } :
    function(name, member) {
      proxy[name] =
        lateBinding? lateProxy(context, name) : $.proxy(member, context);
    });
  return proxy;
}

/**
 * Replaces "this" returns with proxy.
 */
function polyReflexiveLateProxy(proxy, context, members) {
  $.each(members, function(i, name) {
    proxy[name] = function() {
      context[name].apply(context, arguments);
      return proxy;
    };
  });
  return proxy;
}

function defineEvent(pthis, ifc, name, flags) {
  var dispatcher = $.Callbacks(flags);
  //Use polyProxy on function that fires to add the callable syntactic sugar
  var callableDispatcher = pthis[name] = polyProxy(function() {
    dispatcher.fireWith.call(dispatcher, ifc, arguments);
  }, dispatcher, dispatcher, false);

  if (flags && flags.indexOf('private') > -1) {
    return;
  }

  if (flags && flags.indexOf('public') > -1) {
    ifc[name] = callableDispatcher;
  } else {
    var publicEvent = {};
    /* We'll want the context to actually be callableDispatcher even though
     * the interface and functionality of dispatcher suffice so that we can
     * late-bind to the instance exposed to private this. */
    polyProxy(publicEvent, callableDispatcher,
      ['disabled', 'fired', 'has', 'locked'], true);
    polyReflexiveLateProxy(publicEvent, callableDispatcher,
      ['add', 'disable', 'empty', 'lock', 'remove']);

    ifc[name] = publicEvent;
  }
}

function defineEventsFromObject(pthis, ifc, events) {
  $.each(events, function(event, flags) {
    defineEvent(pthis, ifc, event, flags);
  });
}
