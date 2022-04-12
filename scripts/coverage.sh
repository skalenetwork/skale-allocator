#!/bin/bash

set -e

npx hardhat coverage --solcoverjs .solcover.js
bash <(curl -s https://codecov.io/bash)
