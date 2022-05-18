import {promises as fs} from 'fs';
import {existsSync} from 'fs';
import { Interface } from "ethers/lib/utils";
import { ethers, upgrades, network, run } from "hardhat";
import { getAbi } from './tools/abi';
import { verifyProxy } from './tools/verification';
import { Manifest } from "@openzeppelin/upgrades-core";
import { getVersion } from './tools/version';
import chalk from "chalk";
import { SkaleABIFile } from './tools/types';
import { ContractTransaction } from 'ethers';


export function getContractKeyInAbiFile(contract: string) {
    return contract.replace(/([a-zA-Z])(?=[A-Z])/g, '$1_').toLowerCase();
}

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

export async function getManifestFile(): Promise<string> {
    return (await Manifest.forNetwork(ethers.provider)).file;
}

export const contracts = [
    "Allocator",
    "Escrow"
]

async function main() {
    if (await ethers.provider.getCode("0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24") === "0x") {
        await run("erc1820");
    }

    if (!existsSync(__dirname + "/../scripts/manager.json")) {
        console.log("PLEASE Provide a manager.json file to scripts folder which contains abis & addresses of skale manager contracts ");
        process.exit(1);
    }

    const version = await getVersion();
    const contractArtifacts: { address: string, interface: Interface, contract: string }[] = [];

    const managerConfig = JSON.parse(await fs.readFile(__dirname + "/../scripts/manager.json", "utf-8")) as SkaleABIFile;
    const contractManagerName = "ContractManager";
    const contractManagerFactory = await ethers.getContractFactory(contractManagerName);
    const contractManager = contractManagerFactory.attach(managerConfig[getContractKeyInAbiFile(contractManagerName) + "_address"] as string) ;

    for (const contract of contracts) {
        const contractFactory = await ethers.getContractFactory(contract);
        console.log("Deploy", contract);
        const proxy = await upgrades.deployProxy(
            contractFactory,
            await getInitializerParameters(contract, contractManager.address),
            {
                initializer: getInitializer(contract)
            }
        );
        await proxy.deployTransaction.wait();
        console.log("Register", contract, "=>", proxy.address);
        await contractManager.setContractsAddress(contract, proxy.address);
        contractArtifacts.push({ address: proxy.address, interface: proxy.interface, contract });
        await verifyProxy(contract, proxy.address, []);

        if (contract === "Allocator") {
            try {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                await (await proxy.setVersion(version) as ContractTransaction).wait();
                console.log(`Set version ${version}`)
            } catch {
                console.log(chalk.red("Failed to set skale-allocator version"));
            }
        }
    }

    console.log("Store ABIs");

    const outputObject: { [k: string]: unknown } = {};
    for (const artifact of contractArtifacts) {
        const contractKey = getContractKeyInAbiFile(artifact.contract);
        outputObject[contractKey + "_address"] = artifact.address;
        outputObject[contractKey + "_abi"] = getAbi(artifact.interface);
    }

    const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(outputObject.escrow_address as string);
    await contractManager.setContractsAddress("ProxyAdmin", proxyAdminAddress);

    await fs.writeFile(`data/skale-allocator-${version}-${network.name}-abi.json`, JSON.stringify(outputObject, null, 4));
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
