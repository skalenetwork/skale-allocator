import { deploySkaleTokenTester } from "./skaleTokenTester";
import { deployTokenStateTester } from "./tokenStateTester";
import { ContractManager, DelegationControllerTester } from "../../../../typechain-types";
import { defaultDeploy, deployFunctionFactory } from "./../factory";

export const deployDelegationControllerTester = deployFunctionFactory(
    "DelegationControllerTester",
    async (contractManager: ContractManager) => {
        await deploySkaleTokenTester(contractManager);
        await deployTokenStateTester(contractManager);
    },
    async(contractManager: ContractManager) => {
        const tokenState = await defaultDeploy("DelegationControllerTester", contractManager);
        await contractManager.setContractsAddress("DelegationController", tokenState.address);
        return tokenState;
    }
) as  (contractManager: ContractManager) => Promise<DelegationControllerTester>;



                            