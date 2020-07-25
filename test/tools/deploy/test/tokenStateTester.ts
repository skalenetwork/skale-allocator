import { ContractManagerInstance,
    TokenStateTesterContract } from "../../../../types/truffle-contracts";

const TokenState: TokenStateTesterContract = artifacts.require("./TokenStateTester");
const name = "TokenState";

export async function deployTokenStateTester(contractManager: ContractManagerInstance) {
    try {
        const address = await contractManager.getContract(name);
        return TokenState.at(address);
    } catch (e) {
        const tokenState = await TokenState.new();
        await tokenState.initialize(contractManager.address);
        await contractManager.setContractsAddress(name, tokenState.address);
        return tokenState;
    }
}
