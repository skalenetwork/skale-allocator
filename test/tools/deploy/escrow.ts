import { ethers } from "hardhat";
import { ContractManager, Escrow } from "../../../typechain-types";
import { deployFunctionFactory } from "./factory";
import { deployDelegationControllerTester } from "./test/delegationControllerTester";

export const deployEscrow = deployFunctionFactory(
    "Escrow",
    async (contractManager: ContractManager) => {
        await deployDelegationControllerTester(contractManager);
    },
    async () => {
        const factory = await ethers.getContractFactory("Escrow")
        const escrow = await factory.deploy();
        return escrow;
    }) as (contractManager: ContractManager) => Promise<Escrow>;
                                               