#!/usr/bin/env bash

DEPLOYED_DIR=$GITHUB_WORKSPACE/deployed-skale-allocator/
DEPLOYED_MANAGER_DIR=$GITHUB_WORKSPACE/deployed-skale-manager/

git clone --branch stable https://github.com/$GITHUB_REPOSITORY.git $DEPLOYED_DIR
git clone --branch stable https://github.com/skalenetwork/skale-manager.git $DEPLOYED_MANAGER_DIR

npx ganache-cli --gasLimit 8000000 --quiet &
GANACHE_PID=$!

cd $DEPLOYED_MANAGER_DIR
yarn install
NODE_OPTIONS="--max-old-space-size=4096" PRODUCTION=true npx truffle migrate --network test || exit $?
cp data/test.json $DEPLOYED_DIR/scripts/manager.json

cd $DEPLOYED_DIR
yarn install
NODE_OPTIONS="--max-old-space-size=4096" npx truffle migrate --network test || exit $?
rm $GITHUB_WORKSPACE/.openzeppelin/dev-*.json
cp .openzeppelin/dev-*.json $GITHUB_WORKSPACE/.openzeppelin
cd $GITHUB_WORKSPACE

npx oz upgrade --network test --all || exit $?

kill $GANACHE_PID
