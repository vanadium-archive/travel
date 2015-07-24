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
module.exports = function defineClass(def) {
  var constructor = function() {
    var pthis = $.extend({}, def.privates, def.publics, def.statics);
    var ifc = this;
    
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
    
    if (def.statics)
      $.extend(ifc, def.statics);
    
    if (def.init)
      def.init.apply(pthis, arguments);
    
    if (def.publics)
      polyProxy(ifc, pthis, def.publics);
    
    if (def.constants) {
      $.each(def.constants, function(i, constant) {
        ifc[constant] = pthis[constant];
      });
    }
  };
  
  if (def.statics)
    $.extend(constructor, def.statics);
  
  return constructor;
};

function polyProxy(proxy, context, members) {
  $.each(members, function(name, member) {
    proxy[name] = $.proxy(member, context);
  });
  return proxy;
}

function filterProxy(proxy, context, nameFilter) {
  $.each(context, function(name, member) {
    if (nameFilter(name))
      proxy[name] = $.proxy(member, context);
  });
  return proxy;
}

function defineEvent(pthis, ifc, name, flags) {
  var dispatcher = $.Callbacks(flags);
  //Use polyProxy on function that fires to add the callable syntactic sugar
  var callableDispatcher = pthis[name] =
    polyProxy($.proxy(dispatcher, 'fire'), dispatcher, dispatcher);
    
  if (flags && flags.indexOf('private') > -1)
    return;
  
  if (flags && flags.indexOf('public') > -1) {
    ifc[name] = callableDispatcher;
  } else {
    ifc[name] = filterProxy({}, dispatcher, function(name) {
      return name != 'fire' && name != 'fireWith';
    });
  }
}

function defineEventsFromObject(pthis, ifc, events) {
  $.each(events, function(event, flags) {
    defineEvent(pthis, ifc, event, flags);
  });
}
