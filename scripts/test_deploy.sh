#!/usr/bin/env bash

set -e

export NVM_DIR=~/.nvm;
source $NVM_DIR/nvm.sh;


DEPLOYED_WITH_NODE_VERSION="lts/hydrogen"
CURRENT_NODE_VERSION=$(nvm current)

git clone https://github.com/skalenetwork/skale-manager.git
echo "Skale manager cloned"
HARDHAT_NODE_SESSION="hardhat-node"
yarn pm2 start "yarn hardhat node" --name "$HARDHAT_NODE_SESSION"

cleanup() {
    echo "Stopping Hardhat Node"
    yarn pm2 delete "$HARDHAT_NODE_SESSION"
}

trap cleanup EXIT

cd skale-manager
nvm install $DEPLOYED_WITH_NODE_VERSION
nvm use $DEPLOYED_WITH_NODE_VERSION
yarn install
PRODUCTION=true npx hardhat run migrations/deploy.ts --network localhost
export SKALE_MANAGER_ADDRESS=$(cat data/skale-manager-*-contracts.json | jq -r .SkaleManager)
cd ..
rm -r --interactive=never skale-manager

nvm use $CURRENT_NODE_VERSION

SKALE_MANAGER_ADDRESS=$SKALE_MANAGER_ADDRESS npx hardhat run migrations/deploy.ts --network localhost
