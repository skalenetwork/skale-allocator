#!/bin/bash

set -e

yarn hardhat coverage --solcoverjs .solcover.js
bash <(curl -s https://codecov.io/bash)
