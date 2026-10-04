#!/usr/bin/env bash
set -euo pipefail

VERSION="${TYPST_VERSION:-0.15.1}"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) TARGET="x86_64-unknown-linux-musl" ;;
  aarch64) TARGET="aarch64-unknown-linux-musl" ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${TYPST_BIN_DIR:-$ROOT/.venv/bin}"
ARCHIVE="/tmp/typst-$VERSION.tar.xz"
EXTRACT="/tmp/typst-$VERSION-$TARGET"

mkdir -p "$BIN_DIR"
curl -fsSL "https://github.com/typst/typst/releases/download/v$VERSION/typst-$TARGET.tar.xz" -o "$ARCHIVE"
# Integrity: upstream publishes no stable checksum file, so verify the
# archive contains exactly the expected binary before extracting.
if ! tar -tf "$ARCHIVE" | grep -qx "typst-$TARGET/typst"; then
  echo "Unexpected typst archive contents:" >&2
  tar -tf "$ARCHIVE" >&2
  exit 1
fi
rm -rf "$EXTRACT"
mkdir -p "$EXTRACT"
tar -xJf "$ARCHIVE" -C "$EXTRACT" --strip-components=1
mv "$EXTRACT/typst" "$BIN_DIR/typst"
chmod +x "$BIN_DIR/typst"
"$BIN_DIR/typst" --version
