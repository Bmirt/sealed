#!/usr/bin/env bash
# One command: (localnet validator →) build+deploy program → server + web + watchdog.
# Usage: bash scripts/dev.sh [--reset]              localnet (default)
#        CLUSTER=devnet bash scripts/dev.sh          devnet (needs a funded ~/.config/solana/id.json)
# --reset wipes the local ledger and the server store for the chosen cluster.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# Prefer the newest installed Agave release: `avm` flips the active release to an old one whose
# platform-tools cannot build current crates (edition2024).
STABLE_BIN="$(ls -d "$HOME"/.local/share/solana/install/releases/stable-*/solana-release/bin 2>/dev/null | head -1 || true)"
export PATH="${STABLE_BIN:+$STABLE_BIN:}$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"

CLUSTER="${CLUSTER:-localnet}"
RESET=""
[[ "${1:-}" == "--reset" ]] && RESET="--reset"

if [[ -n "$RESET" ]]; then
  rm -f "server/data/store.${CLUSTER}.json"
  [[ "$CLUSTER" == "localnet" ]] && rm -rf test-ledger
fi

if [[ "$CLUSTER" == "devnet" ]]; then
  RPC_URL="https://api.devnet.solana.com"
  ARCH="v0"        # SIMD-0500 (v3-only deploys) is not active on devnet
else
  RPC_URL="http://127.0.0.1:8899"
  ARCH="v3"        # Agave ≥ 4 localnet only accepts SBPF v3 deployments
fi
export SEALED_CLUSTER="$CLUSTER" SOLANA_RPC="$RPC_URL" VITE_SEALED_CLUSTER="$CLUSTER" VITE_SOLANA_RPC="$RPC_URL"
# Ashfall Dynasty runs in provably-fair mode: outcomes come from the SEALED server.
export VITE_SEALED_SERVER="http://localhost:4000" VITE_SEALED_VERIFY_URL="http://localhost:5173/verify" VITE_ASHFALL_URL="http://localhost:5174"

# 1. Validator (localnet only)
if [[ "$CLUSTER" == "localnet" ]] && ! curl -s http://127.0.0.1:8899 -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q ok; then
  echo "▶ starting solana-test-validator"
  solana-test-validator $RESET --ledger test-ledger --quiet > test-ledger.log 2>&1 &
  echo $! > .validator.pid
  for i in $(seq 1 60); do
    sleep 1
    curl -s http://127.0.0.1:8899 -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q ok && break
  done
fi
solana config set --url "$RPC_URL" > /dev/null

# 2. Wallet + program
[[ -f "$HOME/.config/solana/id.json" ]] || solana-keygen new --no-bip39-passphrase -s -o "$HOME/.config/solana/id.json"
if [[ "$CLUSTER" == "localnet" ]]; then
  solana airdrop 100 > /dev/null 2>&1 || true
else
  echo "▶ devnet authority $(solana address): $(solana balance)"
fi
if [[ ! -f target/idl/sealed_engine.json ]]; then
  echo "▶ anchor build (IDL + types)"
  anchor build
  anchor keys sync
  anchor build
fi
cp target/idl/sealed_engine.json server/idl/sealed_engine.json   # the server reads the tracked copy
# Anchor 0.31 cannot pass --arch through, so the deployable binary is produced by cargo-build-sbf
# directly with the SBPF version the target cluster accepts.
echo "▶ cargo build-sbf --arch $ARCH"
rm -f target/deploy/sealed_engine.so   # cargo-build-sbf skips the copy if a stale binary exists
(cd programs/sealed_engine && cargo build-sbf --arch "$ARCH")
PROGRAM_ID="$(solana address -k target/deploy/sealed_engine-keypair.json)"
if solana program show "$PROGRAM_ID" > /dev/null 2>&1 && [[ "$CLUSTER" == "devnet" ]]; then
  echo "▶ program $PROGRAM_ID already deployed on devnet (redeploy with: solana program deploy target/deploy/sealed_engine.so --program-id target/deploy/sealed_engine-keypair.json)"
else
  echo "▶ deploy to $CLUSTER"
  solana program deploy target/deploy/sealed_engine.so --program-id target/deploy/sealed_engine-keypair.json
fi

# 3. Services
echo "▶ starting server (4000), watchdog (4100), web (5173), ashfall (5174)"
trap 'kill 0' EXIT
pnpm --filter server dev &
sleep 2
pnpm --filter watchdog dev &
pnpm --filter web dev &
pnpm --filter ashfall dev &
sleep 2
cat <<MSG

  ┌───────────────────────────────────────────────────────────┐
  │  SEALED is up                                             │
  │  games     http://localhost:5173/                         │
  │  dice      http://localhost:5173/play                     │
  │  ashfall   http://localhost:5174/                         │
  │  verify    http://localhost:5173/verify                   │
  │  server    http://localhost:4000/state                    │
  │  watchdog  http://localhost:4100/status                   │
  │  cluster   $CLUSTER                                        │
  │  seed demo data:  pnpm seed                               │
  └───────────────────────────────────────────────────────────┘

MSG
wait
