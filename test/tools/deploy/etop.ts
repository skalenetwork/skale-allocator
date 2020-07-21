import { ContractManagerInstance, ETOPInstance } from "./../../../types/truffle-contracts";
import { deployFunctionFactory } from "./factory";
import { deploySkaleTokenTester } from "./test/skaleTokenTester";
import { deployTimeHelpersTester } from "./test/timeHelpersTester";
import { deployVestingEscrowCreator } from "./vestingEscrowCreator";

const deployETOP: (contractManager: ContractManagerInstance) => Promise<ETOPInstance>
    = deployFunctionFactory("ETOP",
                            async (contractManager: ContractManagerInstance) => {
                                await deploySkaleTokenTester(contractManager);
                                await deployTimeHelpersTester(contractManager);
                                await deployVestingEscrowCreator(contractManager);
                            });

export { deployETOP };
