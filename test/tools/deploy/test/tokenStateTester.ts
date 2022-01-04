import { ethers } from "hardhat";
import { ContractManager, TokenStateTester } from "../../../../typechain";
import { deployFunctionFactory } from "./../factory";

export const deployTokenStateTester: (contractManager: ContractManager) => Promise<TokenStateTester>
    = deployFunctionFactory("TokenStateTester",
                            undefined,
                            async (contractManager: ContractManager) => {
                                const Contract = await ethers.getContractFactory("TokenStateTester");
                                const instance = await Contract.deploy();
                                await instance.initialize(contractManager.address);
                                await contractManager.setContractsAddress("TokenState", instance.address);
                                return instance;
                            });
