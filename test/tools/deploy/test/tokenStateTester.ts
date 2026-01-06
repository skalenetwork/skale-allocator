import { ContractManager, TokenStateTester } from "../../../../typechain-types";
import { defaultDeploy, deployFunctionFactory } from "./../factory";

export const deployTokenStateTester = deployFunctionFactory(
    "TokenStateTester",
    undefined,
    async (contractManager: ContractManager) => {
        const tokenState = await defaultDeploy("TokenStateTester", contractManager);
        await contractManager.setContractsAddress("TokenState", await tokenState.getAddress());
        return tokenState;
    }
) as (contractManager: ContractManager) => Promise<TokenStateTester>;

