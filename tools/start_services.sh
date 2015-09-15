#!/bin/bash
# Copyright 2015 The Vanadium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style
# license that can be found in the LICENSE file.

# Expects credentials in tmp/creds, generated as follows:
#
# make creds
#
# Optionally, the creds variable can specify a subdirectory.

PATH=${PATH}:bin

set -euo pipefail

main() {
  local -r TMP=tmp
  local -r CREDS=./tmp/creds/${creds-}
  local -r PORT=${port-4000}
  local -r SYNCBASED_ADDR=":$((PORT))"
  local -r BLESSINGS=`principal dump --v23.credentials=${CREDS} -s=true`

  if [ ${client-} ]; then
    local -r SG_NAME=dummy # a value is required or syncgroups aren't joinable (bug)

    echo "Starting syncbased on ${SYNCBASED_ADDR}"
  else
    local -r RE="dev\.v\.io/u/(.*)"
    if [[ ${BLESSINGS} =~ ${RE} ]]; then
      local -r V_USER=${BASH_REMATCH[1]}
    fi
    local -r SG_NAME=users/${V_USER}/travel/sgadmin
    local -r NS_ROOT=/ns.dev.v.io:8101
    local -r NS_OPT="--v23.namespace.root=${NS_ROOT}"

    echo "Starting syncbased on ${SYNCBASED_ADDR} mounted at ${NS_ROOT}/${SG_NAME}"
  fi

  mkdir -p $TMP
  syncbased \
    --v=5 \
    --alsologtostderr=false \
    --root-dir=${TMP}/syncbase_${PORT} \
    --name=${SG_NAME} \
    ${NS_OPT-} \
    --v23.proxy=/ns.dev.v.io:8101/proxy \
    --v23.tcp.address=${SYNCBASED_ADDR} \
    --v23.credentials=${CREDS} \
    --v23.permissions.literal="{\"Admin\":{\"In\":[\"${BLESSINGS}\"]},\"Write\":{\"In\":[\"${BLESSINGS}\"]},\"Read\":{\"In\":[\"${BLESSINGS}\"]},\"Resolve\":{\"In\":[\"${BLESSINGS}\"]},\"Debug\":{\"In\":[\"...\"]}}"
}
main "$@"
