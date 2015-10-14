// Copyright 2015 The Vanadium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package io.v.baku.sample.travel;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import android.widget.Toast;

import com.google.common.collect.Lists;

import java.util.List;

import io.v.android.v23.V;
import io.v.v23.context.VContext;
import io.v.v23.rpc.ListenSpec;
import io.v.v23.rpc.Server;
import io.v.v23.security.BlessingPattern;
import io.v.v23.security.Blessings;
import io.v.v23.security.VCertificate;
import io.v.v23.security.VPrincipal;
import io.v.v23.security.VSecurity;
import io.v.v23.verror.VException;
import io.v.v23.vom.VomUtil;

import ifc.TravelServer;

public class TravelService extends Service {
    public static final String BLESSINGS_KEY = "Blessings";
    private VContext baseContext;

    @Override
    public IBinder onBind(Intent intent) {
        return null; // Binding not allowed
    }

    /**
     * This method decodes the passed-in blessings and calls
     * startLocationServer to actually start and mount the
     * Vanadium server.
     */
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Initialize Vanadium.
        baseContext = V.init(this);

        // Fetch the blessings from the intent. The activity that is starting
        // the service must populate this field.
        String blessingsVom = intent.getStringExtra(BLESSINGS_KEY);

        if (blessingsVom == null || blessingsVom.isEmpty()) {
            String msg = "Couldn't start TravelService: "
                    + "null or empty encoded blessings.";
            Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
            return START_REDELIVER_INTENT;
        }

        try {
            Blessings blessings = (Blessings) VomUtil.decodeFromString(
                    blessingsVom, Blessings.class);
            if (blessings == null) {
                String msg = "Couldn't start TravelService: "
                        + "null blessings.";
                Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
                return START_REDELIVER_INTENT;
            }

            // We have blessings, start the server!
            startTravelServer(blessings);
        } catch (VException e) {
            String msg = "Couldn't start TravelService: " + e.getMessage();
            Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
        }
        return START_REDELIVER_INTENT;
    }

    /**
     * This method starts and mounts the Vanadium location server with the given
     * blessings.
     */
    public void startTravelServer(Blessings blessings) throws VException {
        // Principal represents our identity within the Vanadium system.
        VPrincipal principal = V.getPrincipal(baseContext);

        // Provide the given blessings when anybody connects to us.
        principal.blessingStore().setDefaultBlessings(blessings);

        // Also, provide these blessings when we connect to other services (for
        // example, when we talk to the mounttable).
        principal.blessingStore().set(blessings, new BlessingPattern("..."));

        // Trust these blessings and all the "parent" blessings.
        VSecurity.addToRoots(principal, blessings);

        // Our security environment is now set-up. Let's find a home in the
        // namespace for our service.
        String mountPoint;
        String prefix = mountNameFromBlessings(blessings);

        if (prefix.isEmpty()) {
            throw new VException("Could not determine mount point: "
                    + "no username in blessings.");
        } else {
            mountPoint = "users/" + prefix + "/travel/mobile";
            String msg = "Mounting server at " + mountPoint;
            Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
        }

        // Now create the server and mount it.
        final TravelServer sync = new TravelSync();

        // Use Vanadium's production proxy server for NAT traversal. None of
        // your data is visible to the proxy server because it's all encrypted.
        ListenSpec spec = V.getListenSpec(baseContext).withProxy("proxy");

        // Finally, the magic moment!
        Server server = V.getServer(
                V.withNewServer(V.withListenSpec(baseContext, spec),
                        mountPoint, sync, null));

        Toast.makeText(this, "Success!", Toast.LENGTH_SHORT).show();
    }

    /**
     * This method finds the last certificate in our blessing's certificate
     * chains whose extension contains an '@'. We will assume that extension to
     * represent our username.
     */
    private static String mountNameFromBlessings(Blessings blessings) {
        for (List<VCertificate> chain : blessings.getCertificateChains()) {
            for (VCertificate certificate : Lists.reverse(chain)) {
                if (certificate.getExtension().contains("@")) {
                    return certificate.getExtension();
                }
            }
        }
        return "";
    }
}
