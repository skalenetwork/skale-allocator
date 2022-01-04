import { ContractManager, Allocator } from "../../../typechain";
import { deployFunctionFactory } from "./factory";
import { deployTimeHelpersTester } from "./test/timeHelpersTester";
import { deployEscrow } from "./escrow";
import { deployProxyFactoryMock } from "./test/proxyFactoryMock";

export const deployAllocator: (contractManager: ContractManager) => Promise<Allocator>
    = deployFunctionFactory("Allocator",
        async (contractManager: ContractManager) => {
            await deployEscrow(contractManager);
            await deployTimeHelpersTester(contractManager);
            await deployProxyFactoryMock(contractManager);
        });
