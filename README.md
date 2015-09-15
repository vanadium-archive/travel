# Travel Planner

An example travel planner using Vanadium.

## Dependencies

If you have a `$V23_ROOT` setup you can install Node.js from
`$V23_ROOT/third_party` by running:

    v23 profile install nodejs

Optionally, it is possible to use your own install of Node.js if you would like
to use a more recent version.

## Building

The default make task will install any modules listed in the `package.json` and
build a browser bundle from `src/index.js` via browserify.

    make

It is possible to have the build happen automatically anytime a JavaScript file
changes using the watch tool:

    watch make

## Running locally

Local instances require a blessed syncbase instance. To attain blessings and
start syncbase, use:

    make syncbase [creds=<creds subdir>] [port=<syncbase port>]

Related target:

    make creds [creds=<creds subdir>]

You can similarly run with fresh creds or syncbase data via:

    make clean-creds
    make clean-syncbase

To run a local dev server use:

    make start [port=<port>]

To connect to a syncbase instance other than the default, navigate to:

    localhost:<server port>/?syncbase=<syncbase name or port>
