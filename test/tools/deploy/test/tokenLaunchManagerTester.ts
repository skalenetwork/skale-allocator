import { ContractManager, TokenLaunchManagerTester } from "../../../../typechain-types";
import { defaultDeploy, deployFunctionFactory } from "./../factory";

export const deployTokenLaunchManagerTester = deployFunctionFactory(
    "TokenLaunchManagerTester",
    undefined,
    async (contractManager: ContractManager) => {
        const tokenState = await defaultDeploy("TokenLaunchManagerTester", contractManager);
        await contractManager.setContractsAddress("TokenLaunchManager", await tokenState.getAddress());
        return tokenState;
    }
) as (contractManager: ContractManager) => Promise<TokenLaunchManagerTester>;

