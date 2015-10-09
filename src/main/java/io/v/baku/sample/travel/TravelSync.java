// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package io.v.baku.sample.travel;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Random;

import io.v.v23.V;
import io.v.v23.context.VContext;
import io.v.v23.naming.Endpoint;
import io.v.v23.rpc.Server;
import io.v.v23.rpc.ServerCall;
import io.v.v23.security.VSecurity;
import io.v.v23.verror.VException;

import ifc.*;

public class TravelSync implements TravelServer {
    @Override
    public void cast(final VContext ctx, final ServerCall call,
        final CastSpec spec) throws VException {
    }

    public Endpoint[] startServer() throws VException {
        // Initialize the Vanadium runtime and load its native shared library
        // implementation. This is required before we can do anything involving
        // Vanadium.
        final VContext context = V.init();

        // Serve a new InMemoryFortuneServer with an allow-everyone authorizer.
        // This call will return immediately, serving is done in a separate
        // thread.
        final Server server = V.getServer(V.withNewServer(context, "",
            this,
            VSecurity.newAllowEveryoneAuthorizer()));

        return server.getStatus().getEndpoints();
    }
}
