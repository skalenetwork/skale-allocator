import { ContractManagerInstance, SkaleTokenTesterContract } from "../../../../types/truffle-contracts";
import { deploySAFT } from "../saft";

const SkaleToken: SkaleTokenTesterContract = artifacts.require("./SkaleTokenTester");
const name = "SkaleToken";

async function deploy(contractManager: ContractManagerInstance) {
    const instance = await SkaleToken.new(contractManager.address, "SkaleToken", "SKL", []);
    await contractManager.setContractsAddress(name, instance.address);
    return instance;
}

async function deployDependencies(contractManager: ContractManagerInstance) {
    await deploySAFT(contractManager);
//     await deployTokenState(contractManager);
//     await deployDelegationController(contractManager);
//     await deployPunisher(contractManager);
}

export async function deploySkaleTokenTester(contractManager: ContractManagerInstance) {
    try {
        return SkaleToken.at(await contractManager.getContract(name));
    } catch (e) {
        const instance = await deploy(contractManager);
        await deployDependencies(contractManager);
        return instance;
    }
}
