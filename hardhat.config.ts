import { task, HardhatUserConfig } from "hardhat/config";
import "@openzeppelin/hardhat-upgrades";
import "solidity-coverage";
import "hardhat-typechain";
import * as dotenv from "dotenv"
import { utils, Wallet } from "ethers";
import { HardhatNetworkAccountUserConfig } from "hardhat/types/config";

dotenv.config();

function getAccounts() {
  const accounts: HardhatNetworkAccountUserConfig[] = [];
  const defaultBalance = utils.parseEther("2000000").toString();

  const n = 10;
  for (let i = 0; i < n; ++i) {
    accounts.push({
      privateKey: Wallet.createRandom().privateKey,
      balance: defaultBalance
    })
  }

  return accounts;
}

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
        version: '0.6.10',
        settings: {
          optimizer:{
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
    hardhat: {
      accounts: getAccounts(),
      blockGasLimit: 12000000
    },
    custom: {
      url: getCustomUrl(process.env.ENDPOINT),
      accounts: getCustomPrivateKey(process.env.PRIVATE_KEY),
      gasPrice: getGasPrice(process.env.GASPRICE)
    }
  }
};

export default config;