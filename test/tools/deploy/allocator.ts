import { ContractManager, Allocator } from "../../../typechain-types";
import { deployFunctionFactory } from "./factory";
import { deployTimeHelpersTester } from "./test/timeHelpersTester";
import { deployEscrow } from "./escrow";
import { deployProxyAdmin } from "./test/proxyAdmin";

export const deployAllocator
    = deployFunctionFactory("Allocator",
        async (contractManager: ContractManager) => {
            await deployEscrow(contractManager);
            await deployTimeHelpersTester(contractManager);
            await deployProxyAdmin(contractManager);
        }) as (contractManager: ContractManager) => Promise<Allocator>;
