import { ethers, upgrades } from "hardhat";
import { ContractManager, ProxyAdmin } from "../../../../typechain-types";
import { deployFunctionFactory } from "../factory";

export const deployProxyAdmin
    = deployFunctionFactory("ProxyAdmin",
                            undefined,
                            async (contractManager: ContractManager) => {
                                const factory = await ethers.getContractFactory("ProxyAdmin")
                                try {
                                    return factory.attach(await contractManager.getContract("ProxyAdmin"));
                                } catch (e) {
                                    const allocator = await contractManager.getContract("Allocator");
                                    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(allocator);
                                    return factory.attach(proxyAdminAddress);
                                }
                            }) as (contractManager: ContractManager) => Promise<ProxyAdmin>;

