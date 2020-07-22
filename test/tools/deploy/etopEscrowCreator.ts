import { ContractManagerInstance,
    ETOPEscrowCreatorContract } from "../../../types/truffle-contracts";

const ETOPEscrowCreator: ETOPEscrowCreatorContract = artifacts.require("./ETOPEscrowCreator");
const name = "ETOPEscrowCreator";

async function deploy(contractManager: ContractManagerInstance) {
    const instance = await ETOPEscrowCreator.new();
    await instance.initialize(contractManager.address);
    await contractManager.setContractsAddress("ETOPEscrowCreator", instance.address);
    return instance;
}

export async function deployETOPEscrowCreator(contractManager: ContractManagerInstance) {
    try {
        return ETOPEscrowCreator.at(await contractManager.getContract(name));
    } catch (e) {
        return await deploy(contractManager);
    }
}
