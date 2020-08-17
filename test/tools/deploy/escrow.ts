import { ContractManagerInstance, EscrowInstance } from "../../../types/truffle-contracts";
import { deployFunctionFactory } from "./factory";
import { deployDelegationControllerTester } from "./test/delegationControllerTester";

export const deployEscrow: (contractManager: ContractManagerInstance) => Promise<EscrowInstance>
    = deployFunctionFactory("Escrow",
                            async (contractManager: ContractManagerInstance) => {
                                await deployDelegationControllerTester(contractManager);
                            });
