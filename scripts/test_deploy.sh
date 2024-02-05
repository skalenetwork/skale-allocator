#!/usr/bin/env bash

set -e

export NVM_DIR=~/.nvm;
source $NVM_DIR/nvm.sh;


DEPLOYED_WITH_NODE_VERSION="lts/hydrogen"
CURRENT_NODE_VERSION=$(nvm current)

git clone --branch stable https://github.com/skalenetwork/skale-manager.git
echo "Skale manager cloned"
npx ganache-cli --gasLimit 8000000 --quiet &

cd skale-manager
nvm install $DEPLOYED_WITH_NODE_VERSION
nvm use $DEPLOYED_WITH_NODE_VERSION
yarn install
PRODUCTION=true npx hardhat run migrations/deploy.ts --network localhost
cp data/skale-manager-*-abi.json ../scripts/manager.json
cd ..
rm -r --interactive=never skale-manager

nvm use $CURRENT_NODE_VERSION

NODE_OPTIONS="--max-old-space-size=4096" npx hardhat run migrations/deploy.ts --network localhost

npx kill-port 8545
