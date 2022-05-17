import { ContractManager, Allocator } from "../../../typechain-types";
import { deployFunctionFactory } from "./factory";
import { deployTimeHelpersTester } from "./test/timeHelpersTester";
import { deployEscrow } from "./escrow";
import { deployProxyFactoryMock } from "./test/proxyFactoryMock";

export const deployAllocator
    = deployFunctionFactory("Allocator",
        async (contractManager: ContractManager) => {
            await deployEscrow(contractManager);
            await deployTimeHelpersTester(contractManager);
            await deployProxyFactoryMock(contractManager);
        }) as (contractManager: ContractManager) => Promise<Allocator>;
