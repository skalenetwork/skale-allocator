#!/usr/bin/env bash

set -e

if [ -n "$INFURA_API_TOKEN" ]; then
    export MAINNET_ENDPOINT="https://mainnet.infura.io/v3/${INFURA_API_TOKEN}"
else
    # public node is working better than infura free tier
    export MAINNET_ENDPOINT="https://ethereum-rpc.publicnode.com/"
fi

if [ -n "$SKALE_ALLOCATOR_ADDRESS" ]; then
    ALLOCATOR_ADDRESSES="$SKALE_ALLOCATOR_ADDRESS"
else
    # Eth Mainnet Allocators: grants and main
    ALLOCATOR_ADDRESSES="0x07121D22e865fC7513240127742Cb87b24C847a9 0xB575c158399227b6ef4Dcfb05AA3bCa30E12a7ba"
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

# Allocators are upgraded one after another on the same fork,
# so the next one reuses implementations deployed for the previous one
for ALLOCATOR_ADDRESS in $ALLOCATOR_ADDRESSES; do
    echo "Running upgrade check for Allocator $ALLOCATOR_ADDRESS"

    DRY_RUN=true SKALE_ALLOCATOR_ADDRESS=$ALLOCATOR_ADDRESS \
    CHAIN_ID="$CHAIN_ID" \
    npx hardhat run migrations/upgrade.ts --network localhost
done
