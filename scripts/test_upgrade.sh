#!/usr/bin/env bash

set -e

if [ -z $GITHUB_WORKSPACE ]
then
    GITHUB_WORKSPACE="$(dirname "$(dirname "$(realpath "$0")")")"
fi

export NVM_DIR=~/.nvm;
source $NVM_DIR/nvm.sh;

DEPLOYED_ALLOCATOR_TAG=$(cat $GITHUB_WORKSPACE/DEPLOYED)
DEPLOYED_ALLOCATOR_VERSION=$(echo $DEPLOYED_ALLOCATOR_TAG | cut -d '-' -f 1)
DEPLOYED_ALLOCATOR_DIR=$GITHUB_WORKSPACE/deployed-skale-allocator/
DEPLOYED_MANAGER_DIR=$GITHUB_WORKSPACE/deployed-skale-manager/

DEPLOYED_WITH_NODE_VERSION="lts/erbium"
CURRENT_NODE_VERSION=$(nvm current)

git clone --branch $DEPLOYED_ALLOCATOR_TAG https://github.com/skalenetwork/skale-allocator.git $DEPLOYED_ALLOCATOR_DIR
git clone --branch stable https://github.com/skalenetwork/skale-manager.git $DEPLOYED_MANAGER_DIR

npx ganache-cli --gasLimit 8000000 --quiet &
GANACHE_PID=$!

nvm install $DEPLOYED_WITH_NODE_VERSION
nvm use $DEPLOYED_WITH_NODE_VERSION

cd $DEPLOYED_MANAGER_DIR
yarn install
PRODUCTION=true npx hardhat run migrations/deploy.ts --network localhost
cp data/skale-manager-*-abi.json $DEPLOYED_ALLOCATOR_DIR/scripts/manager.json
cp data/skale-manager-*-abi.json $GITHUB_WORKSPACE/scripts/manager.json


cd $DEPLOYED_ALLOCATOR_DIR
yarn install
NODE_OPTIONS="--max-old-space-size=4096" npx truffle migrate --network test
previous_deployments=($GITHUB_WORKSPACE/.openzeppelin/dev-*.json)
if [ -e "${previous_deployments[0]}" ];
then
    rm $GITHUB_WORKSPACE/.openzeppelin/dev-*.json
fi
cp .openzeppelin/dev-*.json $GITHUB_WORKSPACE/.openzeppelin
cp .openzeppelin/project.json $GITHUB_WORKSPACE/.openzeppelin
cp data/test.json $GITHUB_WORKSPACE/data
cd $GITHUB_WORKSPACE

rm -r --interactive=never $DEPLOYED_MANAGER_DIR
rm -r --interactive=never $DEPLOYED_ALLOCATOR_DIR

nvm use $CURRENT_NODE_VERSION

NETWORK_ID=$(ls -a .openzeppelin | grep dev | cut -d '-' -f 2 | cut -d '.' -f 1)
CHAIN_ID=1337

mv .openzeppelin/dev-$NETWORK_ID.json .openzeppelin/mainnet.json

npx migrate-oz-cli-project
MANIFEST=.openzeppelin/mainnet.json VERSION=$DEPLOYED_ALLOCATOR_TAG npx hardhat run scripts/update_manifest.ts --network localhost

mv .openzeppelin/new-mainnet.json .openzeppelin/unknown-$CHAIN_ID.json

ABI=data/test.json npx hardhat run migrations/upgrade.ts --network localhost

kill $GANACHE_PID
