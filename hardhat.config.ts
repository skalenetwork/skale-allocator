import { HardhatUserConfig } from "hardhat/config";
import "@openzeppelin/hardhat-upgrades";
import "solidity-coverage";
import "@typechain/hardhat";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-verify";
import * as dotenv from "dotenv"

dotenv.config();


function getCustomUrl(url: string | undefined) {
  if (url) {
    return url;
  } else {
    return "http://127.0.0.1:8545"
  }
}

function getCustomPrivateKey(privateKey: string | undefined) {
  if (privateKey) {
    return [privateKey];
  } else {
    return [];
  }
}

function getGasPrice(gasPrice: string | undefined) {
  if (gasPrice) {
    return parseInt(gasPrice, 10);
  } else {
    return "auto";
  }
}

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  solidity: {
    compilers: [
      {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      }
    ]
  },
  mocha: {
    timeout: 2000000
  },
  networks: {
    custom: {
      url: getCustomUrl(process.env.ENDPOINT),
      accounts: getCustomPrivateKey(process.env.PRIVATE_KEY),
      gasPrice: getGasPrice(process.env.GASPRICE)
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN
  },
  typechain: {
    target: "ethers-v6",
    externalArtifacts: [
      "node_modules/@openzeppelin/upgrades-core/artifacts/AdminUpgradeabilityProxy.json",
      "node_modules/@openzeppelin/upgrades-core/artifacts/ProxyAdmin.json"
    ]
  }
};

export default config;
