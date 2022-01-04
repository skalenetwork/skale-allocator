import { ethers } from "hardhat";
import { ContractManager, TimeHelpersTester } from "../../../../typechain";
import { deployFunctionFactory } from "./../factory";

export const deployTimeHelpersTester: (contractManager: ContractManager) => Promise<TimeHelpersTester>
    = deployFunctionFactory("TimeHelpersTester",
                            undefined,
                            async (contractManager: ContractManager) => {
                                const Contract = await ethers.getContractFactory("TimeHelpersTester");
                                const instance = await Contract.deploy();
                                await contractManager.setContractsAddress("TimeHelpers", instance.address);
                                return instance;
                            });
