#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if /bin/bash scripts/build-macos.sh; then
  echo 'Concluído. O instalador encontra-se na pasta release.'
else
  echo 'O instalador não foi criado. Leia a mensagem de erro acima.' >&2
  read -r -p 'Prima Enter para fechar...' || true
  exit 1
fi
