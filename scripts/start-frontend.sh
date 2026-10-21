#!/usr/bin/env bash
set -euo pipefail
thors_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$thors_root/frontend"
[[ -d node_modules ]] || npm ci
exec npm run start
