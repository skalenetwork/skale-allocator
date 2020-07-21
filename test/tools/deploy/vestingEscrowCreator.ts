import { ContractManagerInstance,
    VestingEscrowCreatorContract } from "./../../../types/truffle-contracts";

const VestingEscrowCreator: VestingEscrowCreatorContract = artifacts.require("./VestingEscrowCreator");
const name = "VestingEscrowCreator";

async function deploy(contractManager: ContractManagerInstance) {
    const instance = await VestingEscrowCreator.new();
    await instance.initialize(contractManager.address);
    await contractManager.setContractsAddress("VestingEscrowCreator", instance.address);
    return instance;
}

export async function deployVestingEscrowCreator(contractManager: ContractManagerInstance) {
    try {
        return VestingEscrowCreator.at(await contractManager.getContract(name));
    } catch (e) {
        return await deploy(contractManager);
    }
}
