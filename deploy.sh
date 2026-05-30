#!/bin/bash

set -euo pipefail

echo "JSON Base deployment wrapper"
echo "Delegating to npm run deploy with the monorepo deploy CLI."

exec npm run deploy -- "$@"
