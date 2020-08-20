import { deployEscrow } from "../escrow";
import { ProxyFactoryMockInstance, ContractManagerInstance } from "../../../../types/truffle-contracts";

export async function deployProxyFactoryMock(contractManager: ContractManagerInstance) {
    const ProxyFactoryMock = artifacts.require("./ProxyFactoryMock");
    const proxyFactoryMockName = "ProxyFactory";
    try {
        await contractManager.getContract(proxyFactoryMockName);
    } catch (e) {
        const proxyFactoryMock: ProxyFactoryMockInstance = await ProxyFactoryMock.new();
        await contractManager.setContractsAddress(proxyFactoryMockName, proxyFactoryMock.address);
        await contractManager.setContractsAddress("ProxyAdmin", proxyFactoryMock.address);
        const escrow = await deployEscrow(contractManager);
        await proxyFactoryMock.setImplementation(escrow.address);
    }
}