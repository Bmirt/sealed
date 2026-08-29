#!/usr/bin/env bash
# One command: localnet validator → build+deploy program → server + web + watchdog.
# Usage: bash scripts/dev.sh [--reset]   (--reset wipes the ledger and the server store)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# Prefer the newest installed Agave release: `avm` flips the active release to an old one whose
# platform-tools cannot build current crates (edition2024).
STABLE_BIN="$(ls -d "$HOME"/.local/share/solana/install/releases/stable-*/solana-release/bin 2>/dev/null | head -1 || true)"
export PATH="${STABLE_BIN:+$STABLE_BIN:}$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"

RESET=""
[[ "${1:-}" == "--reset" ]] && RESET="--reset"

if [[ -n "$RESET" ]]; then
  rm -rf server/data test-ledger
fi

# 1. Validator
if ! curl -s http://127.0.0.1:8899 -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q ok; then
  echo "▶ starting solana-test-validator"
  solana-test-validator $RESET --ledger test-ledger --quiet > test-ledger.log 2>&1 &
  echo $! > .validator.pid
  for i in $(seq 1 60); do
    sleep 1
    curl -s http://127.0.0.1:8899 -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q ok && break
  done
fi
solana config set --url localhost > /dev/null

# 2. Wallet + program
[[ -f "$HOME/.config/solana/id.json" ]] || solana-keygen new --no-bip39-passphrase -s -o "$HOME/.config/solana/id.json"
solana airdrop 100 > /dev/null 2>&1 || true
if [[ ! -f target/idl/sealed_engine.json ]]; then
  echo "▶ anchor build (IDL + types)"
  anchor build
  anchor keys sync
  anchor build
fi
# Agave ≥ 4 validators only accept SBPF v3 deployments (SIMD-0500); Anchor 0.31 cannot pass
# --arch through, so the deployable binary is produced by cargo-build-sbf directly.
echo "▶ cargo build-sbf --arch v3"
(cd programs/sealed_engine && cargo build-sbf --arch v3)
echo "▶ deploy"
solana program deploy target/deploy/sealed_engine.so --program-id target/deploy/sealed_engine-keypair.json

# 3. Services
echo "▶ starting server (4000), watchdog (4100), web (5173)"
trap 'kill 0' EXIT
pnpm --filter server dev &
sleep 2
pnpm --filter watchdog dev &
pnpm --filter web dev &
sleep 2
cat <<MSG

  ┌───────────────────────────────────────────────────────────┐
  │  SEALED is up                                             │
  │  play      http://localhost:5173/play                     │
  │  verify    http://localhost:5173/verify                   │
  │  server    http://localhost:4000/state                    │
  │  watchdog  http://localhost:4100/status                   │
  │  explorer  https://explorer.solana.com/?cluster=custom    │
  │            &customUrl=http://localhost:8899               │
  │  seed demo data:  pnpm seed                               │
  └───────────────────────────────────────────────────────────┘

MSG
wait
