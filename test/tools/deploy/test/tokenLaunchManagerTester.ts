import { ContractManagerInstance,
    TokenLaunchManagerTesterContract } from "../../../../types/truffle-contracts";

const TimeLaunchManager: TokenLaunchManagerTesterContract = artifacts.require("./TokenLaunchManagerTester");
const name = "TokenLaunchManager";

export async function deployTokenLaunchManagerTester(contractManager: ContractManagerInstance) {
    try {
        const address = await contractManager.getContract(name);
        return TimeLaunchManager.at(address);
    } catch (e) {
        const timeHelpers = await TimeLaunchManager.new();
        await contractManager.setContractsAddress(name, timeHelpers.address);
        return timeHelpers;
    }
}
