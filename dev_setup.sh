#!/usr/bin/env bash
#
# dev_setup.sh — bootstrap a development environment for ReadmeStudio.
#
# Idempotent: safe to re-run; never overwrites existing config files.
#
# Steps:
#   1. Verify the required Node version (installs via nvm if missing).
#   2. Verify pnpm (enables via corepack if missing).
#   3. Copy *.example config files to their local working copies (no overwrite).
#   4. pnpm install (also downloads Puppeteer's Chromium, used by the
#      browser-based tests — the app itself needs no server).
#
# Run from the repo root:  ./dev_setup.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

NVMRC_VERSION="$(tr -d 'v[:space:]' < .nvmrc 2>/dev/null || echo "24")"
REQUIRED_NODE_MAJOR="${NVMRC_VERSION%%.*}"
NVM_INSTALL_VERSION="v0.40.1"

color() { printf '\033[%sm%s\033[0m\n' "$1" "$2"; }
info() { color "1;34" "▶ $1"; }
ok()   { color "1;32" "✓ $1"; }
warn() { color "1;33" "⚠ $1"; }
fail() { color "1;31" "✗ $1"; exit 1; }

# ─── 1. Node ───────────────────────────────────────────────────────────────
info "Checking Node (need v${REQUIRED_NODE_MAJOR}.x)..."
NEED_NODE_INSTALL=0
if command -v node >/dev/null 2>&1; then
  CURRENT_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
  if [ "$CURRENT_MAJOR" = "$REQUIRED_NODE_MAJOR" ]; then
    ok "Node $(node -v)"
  else
    warn "Node $(node -v) found — need v${REQUIRED_NODE_MAJOR}.x"
    NEED_NODE_INSTALL=1
  fi
else
  warn "Node not found"
  NEED_NODE_INSTALL=1
fi

if [ "$NEED_NODE_INSTALL" = "1" ]; then
  info "Checking nvm..."
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1091
    \. "$NVM_DIR/nvm.sh"
    ok "nvm found at $NVM_DIR"
  else
    warn "nvm not found — attempting to install (${NVM_INSTALL_VERSION})"
    if curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_INSTALL_VERSION}/install.sh" | bash; then
      export NVM_DIR="$HOME/.nvm"
      # shellcheck disable=SC1091
      \. "$NVM_DIR/nvm.sh"
      ok "nvm installed"
    else
      fail "Could not install nvm automatically.
   Install it manually, then re-run this script:
   https://github.com/nvm-sh/nvm#install--update-script"
    fi
  fi

  info "Installing Node ${NVMRC_VERSION} via nvm..."
  nvm install "$NVMRC_VERSION" >/dev/null
  nvm use "$NVMRC_VERSION" >/dev/null
  ok "Node $(node -v)"
fi

# ─── 2. pnpm ───────────────────────────────────────────────────────────────
info "Checking pnpm..."
if command -v pnpm >/dev/null 2>&1; then
  ok "pnpm $(pnpm -v)"
else
  warn "pnpm not found — enabling via corepack"
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    ok "pnpm enabled via corepack"
  else
    fail "corepack not found. Install pnpm manually: https://pnpm.io/installation"
  fi
fi

# ─── 3. Config files (idempotent) ──────────────────────────────────────────
info "Setting up local config files..."
copy_if_missing() {
  local src="$1" dst="$2"
  if [ -f "$dst" ]; then
    ok "$dst (kept)"
  elif [ -f "$src" ]; then
    cp "$src" "$dst"
    ok "$dst (created from $(basename "$src"))"
  else
    warn "$src not found — skipped"
  fi
}

copy_if_missing .env.example .env

# ─── 4. Install dependencies ───────────────────────────────────────────────
info "Installing dependencies (includes Chromium for the browser tests)..."
pnpm install
ok "Dependencies installed"

# ─── Done ──────────────────────────────────────────────────────────────────
echo ""
color "1;32" "════════════════════════════════════════════════════"
color "1;32" "  ✓ Setup complete."
color "1;32" "════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  • pnpm dev     — run the app at http://localhost:3000"
echo "  • pnpm test    — run the test suites"
echo "  • pnpm lint    — Biome lint + format check"
echo ""
