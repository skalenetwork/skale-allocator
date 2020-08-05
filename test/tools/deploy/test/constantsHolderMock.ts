import { ContractManagerInstance,
    ConstantsHolderMockContract } from "../../../../types/truffle-contracts";

const ConstantsHolder: ConstantsHolderMockContract = artifacts.require("./ConstantsHolderMock");
const name = "ConstantsHolder";

export async function deployConstantsHolderMock(contractManager: ContractManagerInstance) {
    try {
        const address = await contractManager.getContract(name);
        return ConstantsHolder.at(address);
    } catch (e) {
        const constantsHolder = await ConstantsHolder.new();
        constantsHolder.initialize(contractManager.address);
        await contractManager.setContractsAddress(name, constantsHolder.address);
        return constantsHolder;
    }
}