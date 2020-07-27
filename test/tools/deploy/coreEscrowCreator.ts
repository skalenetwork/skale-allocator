import { ContractManagerInstance,
    COREEscrowCreatorContract } from "../../../types/truffle-contracts";

const COREEscrowCreator: COREEscrowCreatorContract = artifacts.require("./COREEscrowCreator");
const name = "COREEscrowCreator";

async function deploy(contractManager: ContractManagerInstance) {
    const instance = await COREEscrowCreator.new();
    await instance.initialize(contractManager.address);
    await contractManager.setContractsAddress("COREEscrowCreator", instance.address);
    return instance;
}

export async function deployCOREEscrowCreator(contractManager: ContractManagerInstance) {
    try {
        return COREEscrowCreator.at(await contractManager.getContract(name));
    } catch (e) {
        return await deploy(contractManager);
    }
}
