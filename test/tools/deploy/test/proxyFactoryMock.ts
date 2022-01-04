import { deployEscrow } from "../escrow";
import { ProxyFactoryMock, ContractManager } from "../../../../typechain";
import { ethers } from "hardhat";

export async function deployProxyFactoryMock(contractManager: ContractManager) {
    const factory = await ethers.getContractFactory("ProxyFactoryMock");
    const proxyFactoryMockName = "ProxyFactory";
    try {
        await contractManager.getContract(proxyFactoryMockName);
    } catch (e) {
        const proxyFactoryMock = await factory.deploy() as ProxyFactoryMock;
        await contractManager.setContractsAddress(proxyFactoryMockName, proxyFactoryMock.address);
        await contractManager.setContractsAddress("ProxyAdmin", proxyFactoryMock.address);
        const escrow = await deployEscrow(contractManager);
        await proxyFactoryMock.setImplementation(escrow.address);
    }
}