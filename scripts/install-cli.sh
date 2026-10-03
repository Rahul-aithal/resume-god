#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required. Install it from https://docs.astral.sh/uv/" >&2
  exit 1
fi

# Install the console command into uv's global tool bin. The editable install
# keeps this checkout as the source, so `git pull` updates the CLI directly.
# --python is pinned because the system default interpreter may be older than
# the requires-python floor; uv downloads a matching one when needed.
uv tool install --force --editable --python 3.12 "$ROOT"

# Typst is a native renderer and is kept in the checkout's local bin. The CLI
# resolver automatically finds it there from any working directory.
TYPST_BIN_DIR="${TYPST_BIN_DIR:-$ROOT/.venv/bin}" \
  "$ROOT/scripts/install-typst.sh"

if ! command -v resume-god >/dev/null 2>&1; then
  echo
  echo "Installed resume-god, but ~/.local/bin is not currently on PATH."
  echo "Add this line to your shell profile, then restart the terminal:"
  echo
  echo '  export PATH="$HOME/.local/bin:$PATH"'
else
  resume-god doctor
fi
