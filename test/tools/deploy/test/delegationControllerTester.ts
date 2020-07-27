import { ContractManagerInstance,
    DelegationControllerTesterContract } from "../../../../types/truffle-contracts";
import { deploySkaleTokenTester } from "./skaleTokenTester";
import { deployTokenStateTester } from "./tokenStateTester";

const DelegationController: DelegationControllerTesterContract = artifacts.require("./DelegationControllerTester");
const name = "DelegationController";


async function deploy(contractManager: ContractManagerInstance) {
    const instance = await DelegationController.new();
    await instance.initialize(contractManager.address);
    await contractManager.setContractsAddress(name, instance.address);
    return instance;
}

async function deployDependencies(contractManager: ContractManagerInstance) {
    await deploySkaleTokenTester(contractManager);
    await deployTokenStateTester(contractManager);
}

export async function deployDelegationControllerTester(contractManager: ContractManagerInstance) {
    try {
        const address = await contractManager.getContract(name);
        return DelegationController.at(address);
    } catch (e) {
        const delegationController = await deploy(contractManager);
        await deployDependencies(contractManager);
        return delegationController;
    }
}
