import { ContractManagerInstance,
    TokenLaunchManagerTesterContract } from "../../../../types/truffle-contracts";

const TokenLaunchManager: TokenLaunchManagerTesterContract = artifacts.require("./TokenLaunchManagerTester");
const name = "TokenLaunchManager";

export async function deployTokenLaunchManagerTester(contractManager: ContractManagerInstance) {
    try {
        const address = await contractManager.getContract(name);
        return TokenLaunchManager.at(address);
    } catch (e) {
        const tokenLaunchManager = await TokenLaunchManager.new();
        tokenLaunchManager.initialize(contractManager.address);
        await contractManager.setContractsAddress(name, tokenLaunchManager.address);
        return tokenLaunchManager;
    }
}
