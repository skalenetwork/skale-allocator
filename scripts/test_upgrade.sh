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

nvm install $DEPLOYED_WITH_NODE_VERSION
nvm use $DEPLOYED_WITH_NODE_VERSION

cd $DEPLOYED_MANAGER_DIR
yarn install
PRODUCTION=true npx hardhat run migrations/deploy.ts --network localhost
cp data/skale-manager-*-abi.json $DEPLOYED_ALLOCATOR_DIR/scripts/manager.json
cp data/skale-manager-*-abi.json $GITHUB_WORKSPACE/scripts/manager.json


cd $DEPLOYED_ALLOCATOR_DIR
yarn install
npx hardhat run migrations/deploy.ts --network localhost
cp .openzeppelin/unknown-*.json $GITHUB_WORKSPACE/.openzeppelin
cp data/skale-allocator-*-abi.json $GITHUB_WORKSPACE/data
cd $GITHUB_WORKSPACE

rm -r --interactive=never $DEPLOYED_MANAGER_DIR
rm -r --interactive=never $DEPLOYED_ALLOCATOR_DIR

nvm use $CURRENT_NODE_VERSION
ABI_FILENAME="skale-manager-$DEPLOYED_VERSION-localhost-abi.json"

ABI="data/$ABI_FILENAME" npx hardhat run migrations/upgrade.ts --network localhost

npx kill-port 8545
