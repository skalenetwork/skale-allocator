import { ethers } from "hardhat";
import { ContractManager,
    TokenLaunchManagerTester } from "../../../../typechain";

const name = "TokenLaunchManager";

export async function deployTokenLaunchManagerTester(contractManager: ContractManager) {
    const factory = await ethers.getContractFactory("TokenLaunchManagerTester")
    try {
        const address = await contractManager.getContract(name);
        return factory.attach(address);
    } catch (e) {
        const tokenLaunchManager = await factory.deploy();
        tokenLaunchManager.initialize(contractManager.address);
        await contractManager.setContractsAddress(name, tokenLaunchManager.address);
        return tokenLaunchManager;
    }
}
