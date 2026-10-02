import { ethers, upgrades } from "hardhat";
import { ContractManager, Escrow } from "../../../typechain-types";
import { deployFunctionFactory } from "./factory";
import { deployDelegationControllerTester } from "./test/delegationControllerTester";

export const deployEscrow = deployFunctionFactory(
    "Escrow",
    async (contractManager: ContractManager) => {
        await deployDelegationControllerTester(contractManager);

        const escrowAddress = await contractManager.getContract("Escrow");
        const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(escrowAddress);
        const implementationAddress = await upgrades.erc1967.getImplementationAddress(escrowAddress);

        await contractManager.setContractsAddress("ProxyAdmin", proxyAdminAddress);
        await contractManager.setContractsAddress("EscrowImplementation", implementationAddress);
    },
    async (contractManager: ContractManager) => {
        const factory = await ethers.getContractFactory("Escrow");

        const escrow = await upgrades.deployProxy(
            factory,
            [await contractManager.getAddress(), await contractManager.getAddress()],
            {
                initializer: 'initialize(address,address)'
            }
        );
        return escrow;
    }) as (contractManager: ContractManager) => Promise<Escrow>;
