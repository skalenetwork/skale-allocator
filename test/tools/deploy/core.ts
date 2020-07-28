import { ContractManagerInstance, CoreInstance } from "./../../../types/truffle-contracts";
import { deployFunctionFactory } from "./factory";
import { deploySkaleTokenTester } from "./test/skaleTokenTester";
import { deployTimeHelpersTester } from "./test/timeHelpersTester";
import { deployTokenStateTester } from "./test/tokenStateTester";
import { deployDelegationControllerTester } from "./test/delegationControllerTester";

const deployCore: (contractManager: ContractManagerInstance) => Promise<CoreInstance>
    = deployFunctionFactory("Core",
                            async (contractManager: ContractManagerInstance) => {
                                await deploySkaleTokenTester(contractManager);
                                await deployTimeHelpersTester(contractManager);
                                await deployTokenStateTester(contractManager);
                                await deployDelegationControllerTester(contractManager);
                            });

export { deployCore };
