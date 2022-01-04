import { ethers } from "hardhat";
import { ContractManager, Escrow } from "../../../typechain";
import { deployFunctionFactory } from "./factory";
import { deployDelegationControllerTester } from "./test/delegationControllerTester";

export const deployEscrow: (contractManager: ContractManager) => Promise<Escrow>
    = deployFunctionFactory("Escrow",
                            async (contractManager: ContractManager) => {
                                await deployDelegationControllerTester(contractManager);
                            },
                            async (contractManager: ContractManager) => {
                                const factory = await ethers.getContractFactory("Escrow")
                                const escrow = await factory.deploy();
                                return escrow;
                            });
