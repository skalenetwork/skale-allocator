import { ethers, upgrades } from "hardhat";
import { ContractManager, Escrow } from "../../../typechain-types";
import { deployFunctionFactory } from "./factory";
import { deployDelegationControllerTester } from "./test/delegationControllerTester";

export const deployEscrow = deployFunctionFactory(
    "Escrow",
    async (contractManager: ContractManager) => {
        await deployDelegationControllerTester(contractManager);
    },
    async (contractManager: ContractManager) => {
        const factory = await ethers.getContractFactory("Escrow")
        const escrow = await upgrades.deployProxy(
            factory,
            [contractManager.address, contractManager.address],
            {
                initializer: 'initialize(address,address)'
            }
        );
        return escrow;
    }) as (contractManager: ContractManager) => Promise<Escrow>;
                                               