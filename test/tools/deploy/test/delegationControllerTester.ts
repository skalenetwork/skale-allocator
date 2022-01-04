import { deploySkaleTokenTester } from "./skaleTokenTester";
import { deployTokenStateTester } from "./tokenStateTester";
import { ContractManager, DelegationControllerTester } from "../../../../typechain";
import { deployFunctionFactory } from "./../factory";
import { ethers } from "hardhat";

export const deployDelegationControllerTester: (contractManager: ContractManager) => Promise<DelegationControllerTester>
    = deployFunctionFactory("DelegationControllerTester",
                            async (contractManager: ContractManager) => {
                                await deploySkaleTokenTester(contractManager);
                                await deployTokenStateTester(contractManager);
                            },
                            async (contractManager: ContractManager) => {
                                const Contract = await ethers.getContractFactory("DelegationControllerTester");
                                const instance = await Contract.deploy();
                                await instance.initialize(contractManager.address);
                                await contractManager.setContractsAddress("DelegationController", instance.address);
                                return instance;
                            });
