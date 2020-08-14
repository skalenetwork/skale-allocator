#!/usr/bin/env bash

DEPLOYED_DIR=$TRAVIS_BUILD_DIR/deployed-skale-manager/
git clone --branch stable https://github.com/skale-manager.git $DEPLOYED_DIR

npx ganache-cli --gasLimit 8000000 --quiet &
GANACHE_PID=$!

cd $DEPLOYED_DIR
yarn install
npx oz push --network test --force || exit $?
NODE_OPTIONS="--max-old-space-size=4096" PRODUCTION=true npx truffle migrate --network test || exit $?
cp data/test.json ../scripts/manager.json
cd ..

NODE_OPTIONS="--max-old-space-size=4096" PRODUCTION=true npx truffle migrate --network test || exit $?
sleep 5
kill $GANACHE_PID
