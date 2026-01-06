import { ethers, upgrades } from "hardhat";
import { ContractManager } from "../../../typechain-types";

async function defaultDeploy(contractName: string, contractManager: ContractManager) {
    const contractFactory = await ethers.getContractFactory(contractName);
    return await upgrades.deployProxy(contractFactory, [await contractManager.getAddress()]);
}

async function defaultDeployWithConstructor(
    contractName: string,
    contractManager: ContractManager) {
    const contractFactory = await ethers.getContractFactory(contractName);
    return await contractFactory.deploy(await contractManager.getAddress());
}

async function deployWithConstructor(
    contractName: string) {
    const contractFactory = await ethers.getContractFactory(contractName);
    return await contractFactory.deploy();
}

function deployFunctionFactory(
    contractName: string,
    deployDependencies: (contractManager: ContractManager) => Promise<void>
        = () => Promise.resolve(undefined),
    deploy
        = async (contractManager: ContractManager) => {
            return await defaultDeploy(contractName, contractManager);
        }
) {
    return async (contractManager: ContractManager) => {
        const contractFactory = await ethers.getContractFactory(contractName);
        try {
            return contractFactory.attach(await contractManager.getContract(contractName));
        } catch {
            const instance = await deploy(contractManager);
            await contractManager.setContractsAddress(contractName, await instance.getAddress());
            await deployDependencies(contractManager);
            return instance;
        }
    };
}

function deployWithConstructorFunctionFactory(
    contractName: string,
    deployDependencies: (contractManager: ContractManager) => Promise<void>
        = () => Promise.resolve(undefined),
    deploy
        = async (contractManager: ContractManager) => {
            return await defaultDeployWithConstructor(contractName, contractManager);
        }
) {
    return deployFunctionFactory(
        contractName,
        deployDependencies,
        deploy);
}

export {
    deployFunctionFactory,
    deployWithConstructorFunctionFactory,
    deployWithConstructor,
    defaultDeploy
};
