#!/usr/bin/env bash

set -e

GITHUB_WORKSPACE=/home/vadim/code/skale-allocator

DEPLOYED_DIR=$GITHUB_WORKSPACE/deployed-skale-allocator/
DEPLOYED_MANAGER_DIR=$GITHUB_WORKSPACE/deployed-skale-manager/

git clone --branch stable https://github.com/skalenetwork/skale-allocator.git $DEPLOYED_DIR
git clone --branch develop https://github.com/skalenetwork/skale-manager.git $DEPLOYED_MANAGER_DIR

# npx ganache-cli --gasLimit 8000000 --quiet &
# GANACHE_PID=$!

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
cp data/test.json $GITHUB_WORKSPACE/data || exit $?
cd $GITHUB_WORKSPACE

rm -r --interactive=never $DEPLOYED_MANAGER_DIR
rm -r --interactive=never $DEPLOYED_DIR

NETWORK_ID=$(ls -a .openzeppelin | grep dev | cut -d '-' -f 2 | cut -d '.' -f 1)
CHAIN_ID=1337

mv .openzeppelin/dev-$NETWORK_ID.json .openzeppelin/mainnet.json || exit $?

npx migrate-oz-cli-project || exit $?
# MANIFEST=.openzeppelin/mainnet.json VERSION=$DEPLOYED_VERSION npx hardhat run scripts/update_manifest.ts --network localhost || exit $?

mv .openzeppelin/new-mainnet.json .openzeppelin/unknown-$CHAIN_ID.json || exit $?

ABI=data/test.json npx hardhat run migrations/upgrade.ts --network localhost || exit $?

# kill $GANACHE_PID
