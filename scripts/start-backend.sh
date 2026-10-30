#!/usr/bin/env bash
set -euo pipefail
thors_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$thors_root/backend"
[[ -f local.properties ]] || cp local.properties.example local.properties
if [[ -f target/thors-backend-0.2.0.jar ]]; then exec java -jar target/thors-backend-0.2.0.jar; fi
exec mvn spring-boot:run
