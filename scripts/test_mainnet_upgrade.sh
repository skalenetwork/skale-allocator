#!/usr/bin/env bash

set -e

if [ -n "$INFURA_API_TOKEN" ]; then
    export MAINNET_ENDPOINT="https://mainnet.infura.io/v3/${INFURA_API_TOKEN}"
else
    # public node is working better than infura free tier
    export MAINNET_ENDPOINT="https://ethereum-rpc.publicnode.com/"
fi

if [ -n "$SKALE_MANAGER_ADDRESS" ]; then
    export SKALE_MANAGER_ADDRESS=$SKALE_MANAGER_ADDRESS
else
    export SKALE_MANAGER_ADDRESS="0x8b32F750966273cb6D804C02360F3E2743E2B511" # Eth Mainnet SkaleManager
fi

if [ -n "$CHAIN_ID" ]; then
    export CHAIN_ID=$CHAIN_ID
else
    export CHAIN_ID=1
fi


ANVIL_SESSION="anvil-node"
yarn pm2 start "anvil --fork-url $MAINNET_ENDPOINT --chain-id 31337 --gas-price 1 --block-base-fee-per-gas 0" \
  --name "$ANVIL_SESSION"


SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cp "$PROJECT_ROOT/.openzeppelin/mainnet.json" "$PROJECT_ROOT/.openzeppelin/unknown-31337.json"


echo "Waiting for node to initialize..."
sleep 5

echo "Node Initialized."

cleanup() {
    echo "Stopping Anvil Node"
    yarn pm2 delete "$ANVIL_SESSION"
    echo "Removing temporary OpenZeppelin manifest"
    rm -f "$PROJECT_ROOT/.openzeppelin/unknown-31337.json"
}

trap cleanup EXIT

echo "Running upgrade check"

DRY_RUN=true SKALE_MANAGER_ADDRESS=$SKALE_MANAGER_ADDRESS \
CHAIN_ID="$CHAIN_ID" \
npx hardhat run migrations/upgrade.ts --network localhost
