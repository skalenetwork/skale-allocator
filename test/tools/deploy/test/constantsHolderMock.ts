import { ContractManager, ConstantsHolderMock } from "../../../../typechain-types";
import { deployFunctionFactory } from "./../factory";

export const deployConstantsHolderMock
    = deployFunctionFactory("ConstantsHolderMock") as (contractManager: ContractManager) => Promise<ConstantsHolderMock>;