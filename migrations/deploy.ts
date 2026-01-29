import chalk from "chalk";
import { Contract } from "ethers";
import { promises as fs } from 'fs';
import { ethers, upgrades, network } from "hardhat";
import { verifyProxy, getVersion } from "@skalenetwork/upgrade-tools";
import { ContractManager } from "../typechain-types";
import { skaleContracts } from "@skalenetwork/skale-contracts-ethers-v6";


async function getInitializerParameters(contract: string, contractManagerAddress: string) {
    if (["Escrow"].includes(contract)) {
        const [mockBeneficiary] = await ethers.getSigners();
        return [contractManagerAddress, mockBeneficiary.address];
    } else {
        return [contractManagerAddress];
    }
}

function getInitializer(contract: string) {
    if (["Escrow"].includes(contract)) {
        return 'initialize(address,address)';
    } else {
        return undefined;
    }
}

async function getContractManager() {
    const [signer] = await ethers.getSigners();
    const skaleManager = await getSkaleManagerInstance();
    const contractManager = (await skaleManager.getContract("ContractManager")) as ContractManager;
    return contractManager.connect(signer);
}

async function getSkaleManagerInstance() {
    if (!process.env.SKALE_MANAGER_ADDRESS) {
        console.log(chalk.red("Specify desired skale-manager instance"));
        console.log(chalk.red("Set instance alias or SkaleManager address to SKALE_MANAGER_ADDRESS environment variable"));
        process.exit(1);
    }
    const network = await skaleContracts.getNetworkByProvider(ethers.provider);
    const project = network.getProject("skale-manager");
    return await project.getInstance(process.env.SKALE_MANAGER_ADDRESS);
}

export const contracts = [
    "Allocator",
    "Escrow"
]

async function main() {
    const version = await getVersion();
    const contractManager = await getContractManager();
    const addresses: { [name: string]: string } = {};

    for (const contract of contracts) {
        const contractFactory = await ethers.getContractFactory(contract);
        console.log("Deploy", contract);
        const proxy = await upgrades.deployProxy(
            contractFactory,
            await getInitializerParameters(contract, await contractManager.getAddress()),
            {
                initializer: getInitializer(contract)
            }
        ) as Contract;
        await proxy.waitForDeployment();
        const proxyAddress = await proxy.getAddress();
        addresses[contract] = proxyAddress;
        console.log("Register", contract, "=>", proxyAddress);
        await contractManager.setContractsAddress(contract, proxyAddress);
        await verifyProxy(contract, proxyAddress);

        if (contract === "Allocator") {
            try {
                await (await proxy.setVersion(version)).wait();
                console.log(`Set version ${version}`)
            } catch {
                console.log(chalk.red("Failed to set skale-allocator version"));
            }
        }
    }
    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(addresses["Escrow"] as string);
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(addresses["Escrow"] as string);
    await contractManager.setContractsAddress("EscrowImplementation", implementationAddress);
    await contractManager.setContractsAddress("ProxyAdmin", proxyAdminAddress);

    console.log("Store addresses");
    await fs.writeFile(`data/skale-allocator-${version}-${network.name}-contracts.json`, JSON.stringify(addresses, null, 4));

    console.log("Done");
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}
