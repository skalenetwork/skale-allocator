import { ContractManagerInstance, ETOPInstance } from "./../../../types/truffle-contracts";
import { deployFunctionFactory } from "./factory";
import { deploySkaleTokenTester } from "./test/skaleTokenTester";
import { deployTimeHelpersTester } from "./test/timeHelpersTester";
import { deployTokenStateTester } from "./test/tokenStateTester";
import { deployETOPEscrowCreator } from "./etopEscrowCreator";
import { deployDelegationControllerTester } from "./test/delegationControllerTester";

const deployETOP: (contractManager: ContractManagerInstance) => Promise<ETOPInstance>
    = deployFunctionFactory("ETOP",
                            async (contractManager: ContractManagerInstance) => {
                                await deploySkaleTokenTester(contractManager);
                                await deployTimeHelpersTester(contractManager);
                                await deployTokenStateTester(contractManager);
                                await deployETOPEscrowCreator(contractManager);
                                await deployDelegationControllerTester(contractManager);
                            });

export { deployETOP };
