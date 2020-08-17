import { ContractManagerInstance, AllocatorInstance } from "../../../types/truffle-contracts";
import { deployFunctionFactory } from "./factory";
import { deployTimeHelpersTester } from "./test/timeHelpersTester";
import { deployEscrow } from "./escrow";

export const deployAllocator: (contractManager: ContractManagerInstance) => Promise<AllocatorInstance>
    = deployFunctionFactory("Allocator",
                            async (contractManager: ContractManagerInstance) => {
                                await deployEscrow(contractManager);
                                await deployTimeHelpersTester(contractManager);
                            });
