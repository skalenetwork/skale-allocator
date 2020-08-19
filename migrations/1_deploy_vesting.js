let fs = require("fs");
const fsPromises = fs.promises;

let Web3 = require('web3');

let configFile = require('../truffle-config.js');
let erc1820Params = require('../scripts/erc1820.json');

const { scripts, ConfigManager } = require('@openzeppelin/cli');
const { add, push, create } = scripts;

let privateKey = process.env.PRIVATE_KEY;

let erc1820Contract = erc1820Params.contractAddress;
let erc1820Sender = erc1820Params.senderAddress;
let erc1820Bytecode = erc1820Params.bytecode;
let erc1820Amount = "80000000000000000";

function execute(command) {
    const execSync = require('child_process').execSync  
    execSync(command);
}

async function deploy(deployer, networkName, accounts) {
    if (configFile.networks[networkName].host !== "" && configFile.networks[networkName].host !== undefined && configFile.networks[networkName].port !== "" && configFile.networks[networkName].port !== undefined) {
        let web3 = new Web3(new Web3.providers.HttpProvider("http://" + configFile.networks[networkName].host + ":" + configFile.networks[networkName].port));
        if (await web3.eth.getCode(erc1820Contract) == "0x") {
            console.log("Deploying ERC1820 contract!")
            await web3.eth.sendTransaction({ from: configFile.networks[networkName].from, to: erc1820Sender, value: erc1820Amount});
            console.log("Account " + erc1820Sender + " replenished with " + erc1820Amount + " wei");
            await web3.eth.sendSignedTransaction(erc1820Bytecode);
            console.log("ERC1820 contract deployed!");
        } else {
            console.log("ERC1820 contract has already deployed!");
        }
    } else if (configFile.networks[networkName].provider !== "" && configFile.networks[networkName].provider !== undefined) {
        let web3 = new Web3(configFile.networks[networkName].provider());
        if (await web3.eth.getCode(erc1820Contract) == "0x") {
            console.log("Deploying ERC1820 contract!")
            const addr = (await web3.eth.accounts.privateKeyToAccount("0x" + privateKey)).address;
            console.log("Address " + addr + " !!!");
            const nonceNumber = await web3.eth.getTransactionCount(addr);
            const tx = {
                nonce: nonceNumber,
                from: addr,
                to: erc1820Sender,
                gas: "21000",
                value: erc1820Amount
            };
            const signedTx = await web3.eth.signTransaction(tx, "0x" + privateKey);
            await web3.eth.sendSignedTransaction(signedTx.raw || signedTx.rawTransaction);
            console.log("Account " + erc1820Sender + " replenished with " + erc1820Amount + " wei");
            await web3.eth.sendSignedTransaction(erc1820Bytecode);
            console.log("ERC1820 contract deployed!");
        } else {
            console.log("ERC1820 contract has already deployed!");
        }
    }        

    console.log("Starting Allocator deploying...");

    if(!fs.existsSync("../scripts/manager.json")) {
        console.log("PLEASE Provide a manager.json file to scripts folder which contains abis & addresses of skale manager contracts ");
        process.exit();
    }
    
    const deployAccount = accounts[0];
    const options = await ConfigManager.initNetworkConfiguration(
        {
            network: networkName,
            from: deployAccount,
            deployProxyFactory: true
        }
    );

    let contracts = [
        "Allocator",
        "Escrow"
    ]    

    contractsData = [];
    for (const contract of contracts) {
        contractsData.push({name: contract, alias: contract});
    }    

    add({ contractsData: contractsData });

    // Push implementation contracts to the network
    // TODO: Use push function
    // await push(options);  
    execute("npx oz push --deploy-proxy-factory --network " + networkName);

    // deploy upgradable contracts

    const deployed = new Map();
    let contractManager;
    for (const contractName of contracts) {
        let contract = await create(Object.assign({ contractAlias: contractName, methodName: 'initialize', methodArgs: [contractManager.address] }, options));
        deployed.set(contractName, contract);
    }
    
    console.log("Load oz cli contracts");
    
    let networkTitle = await web3.eth.net.getNetworkType();
    if (networkTitle == "private") {
        networkTitle = "dev-" + await web3.eth.net.getId();
    }
    const networkFilename = ".openzeppelin/" + networkTitle + ".json";
    const networkFile = require("../" + networkFilename);
    
    deployed.set("ProxyAdmin", { "address": networkFile.proxyAdmin.address });
    deployed.set("ProxyFactory", { "address": networkFile.proxyFactory.address });
    contracts = contracts.concat(["ProxyAdmin", "ProxyFactory"]);

    console.log("Register contracts");

    let managerConfig = require("../scripts/manager.json");
    contractManager = new web3.eth.Contract(managerConfig['contract_manager_abi'], managerConfig['contract_manager_address']);
    contractManager.address = contractManager._address;
    console.log("contractManager address:", contractManager.address);
    
    for (const contract of contracts) {
        const address = deployed.get(contract).address;
        await contractManager.methods.setContractsAddress(contract, address).send({from: deployAccount}).then(function(res) {
            console.log("Contract", contract, "with address", address, "is registered in Contract Manager");
        });
    }
    
    console.log('Deploy done, writing results...');

    let jsonObject = { };
    for (const contractName of contracts) {
        propertyName = contractName.replace(/([a-zA-Z])(?=[A-Z])/g, '$1_').toLowerCase();
        jsonObject[propertyName + "_address"] = deployed.get(contractName).address;
        if (!["ProxyAdmin", "ProxyFactory"].includes(contractName)) {
            jsonObject[propertyName + "_abi"] = artifacts.require("./" + contractName).abi;
        }
    }

    await fsPromises.writeFile(`data/${networkName}.json`, JSON.stringify(jsonObject));
    console.log(`Done, check ${networkName}.json file in data folder.`);
}

module.exports = deploy;
