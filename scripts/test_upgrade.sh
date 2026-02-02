#!/usr/bin/env bash

# cspell:words toplevel

set -e

if [ -z $GITHUB_WORKSPACE ]
then
    GITHUB_WORKSPACE="$(git rev-parse --show-toplevel)"
fi

export NVM_DIR=~/.nvm;
source $NVM_DIR/nvm.sh;

DEPLOYED_ALLOCATOR_TAG=$(cat $GITHUB_WORKSPACE/DEPLOYED)
DEPLOYED_ALLOCATOR_VERSION=$(echo $DEPLOYED_ALLOCATOR_TAG | cut -d '-' -f 1)
DEPLOYED_ALLOCATOR_DIR=$GITHUB_WORKSPACE/deployed-skale-allocator/
DEPLOYED_MANAGER_DIR=$GITHUB_WORKSPACE/deployed-skale-manager/

SKALE_MANAGER_NODE_VERSION="lts/jod"
DEPLOYED_ALLOCATOR_NODE_VERSION="lts/gallium"
CURRENT_NODE_VERSION=$(nvm current)


git clone --branch $DEPLOYED_ALLOCATOR_TAG https://github.com/skalenetwork/skale-allocator.git $DEPLOYED_ALLOCATOR_DIR
git clone --branch stable https://github.com/skalenetwork/skale-manager.git $DEPLOYED_MANAGER_DIR

HARDHAT_NODE_SESSION="hardhat-node"

yarn pm2 start "yarn hardhat node" --name "$HARDHAT_NODE_SESSION"

cleanup() {
    echo "Stopping Hardhat Node"
    # ensure root dir
    cd $GITHUB_WORKSPACE
    yarn pm2 delete "$HARDHAT_NODE_SESSION"
}

trap cleanup EXIT

nvm install $SKALE_MANAGER_NODE_VERSION
nvm use $SKALE_MANAGER_NODE_VERSION

cd $DEPLOYED_MANAGER_DIR
yarn install

# This one creates temp files in /tmp/openzeppelin-upgrades/ - new version of hardhat-upgrades
VERSION="1.12.0" PRODUCTION=true npx hardhat run migrations/deploy.ts --network localhost
export SKALE_MANAGER_ADDRESS=$(cat data/skale-manager-*-contracts.json | jq -r .SkaleManager)
cp data/skale-manager-*-abi.json $DEPLOYED_ALLOCATOR_DIR/scripts/manager.json


nvm install $DEPLOYED_ALLOCATOR_NODE_VERSION
nvm use $DEPLOYED_ALLOCATOR_NODE_VERSION

cd $DEPLOYED_ALLOCATOR_DIR
yarn install

# This one creates file in .openzeppelin/ - older version of hardhat-upgrades
DEPLOY_OUTPUT=$(VERSION=$DEPLOYED_ALLOCATOR_VERSION npx hardhat run migrations/deploy.ts --network localhost)
export SKALE_ALLOCATOR_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "Register Allocator" | tail -1 | sed 's/.*Register Allocator => //')

cp -r .openzeppelin/. $GITHUB_WORKSPACE/.openzeppelin/
cd $GITHUB_WORKSPACE


rm -r --interactive=never $DEPLOYED_MANAGER_DIR
rm -r --interactive=never $DEPLOYED_ALLOCATOR_DIR

nvm use $CURRENT_NODE_VERSION

# This one needs the files from deploying allocator. Should eliminate the others which will be deemed duplicates.
rm -rf /tmp/openzeppelin-upgrades/*

# run upgrade
SKALE_MANAGER_ADDRESS="$SKALE_MANAGER_ADDRESS" \
SKALE_ALLOCATOR_ADDRESS="$SKALE_ALLOCATOR_ADDRESS" \
npx hardhat run migrations/upgrade.ts --network localhost
