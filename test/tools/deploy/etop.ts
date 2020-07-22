import { ContractManagerInstance, ETOPInstance } from "./../../../types/truffle-contracts";
import { deployFunctionFactory } from "./factory";
import { deploySkaleTokenTester } from "./test/skaleTokenTester";
import { deployTimeHelpersTester } from "./test/timeHelpersTester";
import { deployTokenStateTester } from "./test/tokenStateTester";
import { deployETOPEscrowCreator } from "./etopEscrowCreator";

const deployETOP: (contractManager: ContractManagerInstance) => Promise<ETOPInstance>
    = deployFunctionFactory("ETOP",
                            async (contractManager: ContractManagerInstance) => {
                                await deploySkaleTokenTester(contractManager);
                                await deployTimeHelpersTester(contractManager);
                                await deployTokenStateTester(contractManager);
                                await deployETOPEscrowCreator(contractManager);
                            });

export { deployETOP };
