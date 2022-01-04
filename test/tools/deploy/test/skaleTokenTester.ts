import { ethers } from "hardhat";
import { deployTokenStateTester } from "./tokenStateTester";
import { deployDelegationControllerTester } from "./delegationControllerTester";
import { ContractManager, SkaleTokenTester } from "../../../../typechain";
import { deployFunctionFactory } from "./../factory";

export const deploySkaleTokenTester: (contractManager: ContractManager) => Promise<SkaleTokenTester>
    = deployFunctionFactory("SkaleTokenTester",
                            async (contractManager: ContractManager) => {
                                await deployDelegationControllerTester(contractManager);
                                await deployTokenStateTester(contractManager);
                            },
                            async (contractManager: ContractManager) => {
                                const factory = await ethers.getContractFactory("SkaleTokenTester")
                                const instance = await factory.deploy(contractManager.address, "SkaleToken", "SKL", []);
                                await contractManager.setContractsAddress("SkaleToken", instance.address);
                                return instance;
                            });

