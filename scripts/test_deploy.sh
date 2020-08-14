#!/usr/bin/env bash

git clone --branch stable https://github.com/skalenetwork/skale-manager.git
echo "Skale manager cloned"
npx ganache-cli --gasLimit 8000000 --quiet &
GANACHE_PID=$!

cd skale-manager
yarn install
npx oz push --network test --force || exit $?
NODE_OPTIONS="--max-old-space-size=4096" PRODUCTION=true npx truffle migrate --network test || exit $?
cp data/test.json ../scripts/manager.json
cd ..
sudo rm -r skale-manager

NODE_OPTIONS="--max-old-space-size=4096" PRODUCTION=true npx truffle migrate --network test || exit $?
sleep 5
kill $GANACHE_PID
