#!/usr/bin/env bash

set -e

git clone --branch stable https://github.com/skalenetwork/skale-manager.git
echo "Skale manager cloned"
npx ganache-cli --gasLimit 8000000 --quiet &
GANACHE_PID=$!

cd skale-manager
yarn install
PRODUCTION=true npx hardhat run migrations/deploy.ts --network localhost
cp data/skale-manager-*-abi.json ../scripts/manager.json
cd ..
rm -r --interactive=never skale-manager

NODE_OPTIONS="--max-old-space-size=4096" PRODUCTION=true npx truffle migrate --network test
sleep 5
kill $GANACHE_PID
