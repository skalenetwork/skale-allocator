import { ethers } from "hardhat";
import { ContractManager, TimeHelpersTester } from "../../../../typechain-types";
import { deployFunctionFactory } from "./../factory";

export const deployTimeHelpersTester
    = deployFunctionFactory("TimeHelpersTester",
                            undefined,
                            async (contractManager: ContractManager) => {
                                const Contract = await ethers.getContractFactory("TimeHelpersTester");
                                const instance = await Contract.deploy();
                                await contractManager.setContractsAddress("TimeHelpers", instance.address);
                                return instance;
                            }) as  (contractManager: ContractManager) => Promise<TimeHelpersTester>;
