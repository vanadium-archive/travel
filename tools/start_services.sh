#!/bin/bash
# Copyright 2015 The Vanadium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style
# license that can be found in the LICENSE file.

# Expects credentials in tmp/creds, generated as follows:
#
# make creds

set -euo pipefail
trap kill_child_processes INT TERM EXIT
silence() {
  "$@" &> /dev/null || true
}
# Copied from chat example app.
kill_child_processes() {
  # Attempt to stop child processes using the TERM signal.
  if [[ -n "$(jobs -p -r)" ]]; then
    silence pkill -P $$
    sleep 1
    # Kill any remaining child processes using the KILL signal.
    if [[ -n "$(jobs -p -r)" ]]; then
      silence sudo -u "${SUDO_USER}" pkill -9 -P $$
    fi
  fi
}
main() {
  PATH=${PATH}:${V23_ROOT}/release/go/bin
  local -r TMP=tmp
  local -r CREDS=./tmp/creds/${creds-}
  local -r PORT=${port-4000}
  local -r MOUNTTABLED_ADDR=":$((PORT+1))"
  local -r SYNCBASED_ADDR=":$((PORT))"
  local -r BLESSINGS=`principal dump --v23.credentials=${CREDS} -s=true`
  mkdir -p $TMP
  mounttabled \
    --v23.tcp.address=${MOUNTTABLED_ADDR} \
    --v23.credentials=${CREDS} &
  ./bin/syncbased \
    --v=5 \
    --alsologtostderr=false \
    --root-dir=${TMP}/syncbase_${PORT} \
    --name=syncbase \
    --v23.namespace.root=/${MOUNTTABLED_ADDR} \
    --v23.tcp.address=${SYNCBASED_ADDR} \
    --v23.credentials=${CREDS} \
    --v23.permissions.literal="{\"Admin\":{\"In\":[\"${BLESSINGS}\"]},\"Write\":{\"In\":[\"${BLESSINGS}\"]},\"Read\":{\"In\":[\"${BLESSINGS}\"]},\"Resolve\":{\"In\":[\"${BLESSINGS}\"]},\"Debug\":{\"In\":[\"...\"]}}"
  tail -f /dev/null  # wait forever
}
main "$@"
