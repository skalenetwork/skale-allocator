import { ContractManager, ConstantsHolderMock } from "../../../../typechain";
import { deployFunctionFactory } from "./../factory";

export const deployConstantsHolderMock: (contractManager: ContractManager) => Promise<ConstantsHolderMock>
    = deployFunctionFactory("ConstantsHolderMock");