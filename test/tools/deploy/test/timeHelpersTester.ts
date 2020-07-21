import { ContractManagerInstance,
    TimeHelpersTesterContract } from "../../../../types/truffle-contracts";

const TimeHelpers: TimeHelpersTesterContract = artifacts.require("./TimeHelpersTester");
const name = "TimeHelpers";

export async function deployTimeHelpersTester(contractManager: ContractManagerInstance) {
    try {
        const address = await contractManager.getContract(name);
        return TimeHelpers.at(address);
    } catch (e) {
        const timeHelpers = await TimeHelpers.new();
        await contractManager.setContractsAddress(name, timeHelpers.address);
        return timeHelpers;
    }
}