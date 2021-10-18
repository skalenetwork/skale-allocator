#!/usr/bin/env bash

set -e

DEPLOYED_DIR=$GITHUB_WORKSPACE/deployed-skale-allocator/
DEPLOYED_MANAGER_DIR=$GITHUB_WORKSPACE/deployed-skale-manager/

git clone --branch stable https://github.com/skalenetwork/skale-allocator.git $DEPLOYED_DIR
git clone --branch stable https://github.com/skalenetwork/skale-manager.git $DEPLOYED_MANAGER_DIR

npx ganache-cli --gasLimit 8000000 --quiet &
GANACHE_PID=$!

cd $DEPLOYED_MANAGER_DIR
yarn install
PRODUCTION=true npx hardhat run migrations/deploy.ts --network localhost
cp data/skale-manager-*-abi.json $DEPLOYED_DIR/scripts/manager.json

cd $DEPLOYED_DIR
yarn install
NODE_OPTIONS="--max-old-space-size=4096" npx truffle migrate --network test
previous_deployments=($GITHUB_WORKSPACE/.openzeppelin/dev-*.json)
if [ -e "${previous_deployments[0]}" ];
then
    rm $GITHUB_WORKSPACE/.openzeppelin/dev-*.json
fi
cp .openzeppelin/dev-*.json $GITHUB_WORKSPACE/.openzeppelin
cd $GITHUB_WORKSPACE

rm -r build && npx oz compile
npx oz upgrade --network test --all

rm -r --interactive=never $DEPLOYED_MANAGER_DIR
rm -r --interactive=never $DEPLOYED_DIR

kill $GANACHE_PID
