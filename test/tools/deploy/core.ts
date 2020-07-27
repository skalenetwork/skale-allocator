import { ContractManagerInstance, COREInstance } from "./../../../types/truffle-contracts";
import { deployFunctionFactory } from "./factory";
import { deploySkaleTokenTester } from "./test/skaleTokenTester";
import { deployTimeHelpersTester } from "./test/timeHelpersTester";
import { deployTokenStateTester } from "./test/tokenStateTester";
import { deployCOREEscrowCreator } from "./coreEscrowCreator";
import { deployDelegationControllerTester } from "./test/delegationControllerTester";

const deployCORE: (contractManager: ContractManagerInstance) => Promise<COREInstance>
    = deployFunctionFactory("CORE",
                            async (contractManager: ContractManagerInstance) => {
                                await deploySkaleTokenTester(contractManager);
                                await deployTimeHelpersTester(contractManager);
                                await deployTokenStateTester(contractManager);
                                await deployCOREEscrowCreator(contractManager);
                                await deployDelegationControllerTester(contractManager);
                            });

export { deployCORE };
