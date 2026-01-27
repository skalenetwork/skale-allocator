import chalk from "chalk";
import { contracts } from "./deploy";
import hre, { ethers } from "hardhat";
import { getManifestAdmin } from "@openzeppelin/hardhat-upgrades/dist/admin";
import { ProxyAdmin, Allocator } from "../typechain-types";
import { upgrade, verify, SkaleABIFile, encodeTransaction, getContractKeyInAbiFile } from "@skalenetwork/upgrade-tools";
import { fetchEscrowAddresses } from "../scripts/getEscrows";

async function getAllocator(abi: SkaleABIFile) : Promise<Allocator> {
    return ((await ethers.getContractFactory("Allocator")).attach(
        abi[getContractKeyInAbiFile("Allocator") + "_address"] as string
    ));
}

export async function getDeployedVersion(abi: SkaleABIFile) {
    const allocator = await getAllocator(abi);
    try {
        return await allocator.version();
    } catch {
        console.log(chalk.red("Can't read deployed version"));
    }
}

export async function setNewVersion(safeTransactions: string[], abi: SkaleABIFile, newVersion: string) {
    const allocator = await getAllocator(abi);
    safeTransactions.push(encodeTransaction(
        0,
        allocator.address,
        0,
        allocator.interface.encodeFunctionData("setVersion", [newVersion]),
    ));
}

async function main() {
    await upgrade(
        "skale-allocator",
        "2.2.2",
        getDeployedVersion,
        setNewVersion,
        contracts,
        contracts,
        // async (safeTransactions, abi, contractManager) => {
        async () => {
            // deploy new contracts
        },
        // async (safeTransactions, abi, contractManager) => {
        async (safeTransactions) => {
            let production = false;
            if (process.env.PRODUCTION === "true") {
                production = true;
            }

            let maxFeePerGas = 100*1e9;
            let maxPriorityFeePerGas = 1e9;
            if (hre.network.config.gasPrice !== "auto") {
                maxFeePerGas = hre.network.config.gasPrice;
                maxPriorityFeePerGas = hre.network.config.gasPrice;
            }

            const proxyAdmin = await getManifestAdmin(hre) as ProxyAdmin;
            const [deployer] = await ethers.getSigners();

            if (production) {
                console.log("Fetching escrow addresses...");
                const proxies = await fetchEscrowAddresses();
                console.log(`Found ${proxies.length} escrow addresses`);

                console.log("Deploy implementation");
                const escrowFactory = (await ethers.getContractFactory("Escrow")).connect(deployer);
                const escrow = await escrowFactory.deploy({
                    maxFeePerGas: maxFeePerGas,
                    maxPriorityFeePerGas: maxPriorityFeePerGas
                });
                await escrow.deployTransaction.wait();
                const newImplementationAddress = escrow.address;
                await verify("Escrow", escrow.address, []);

                for (const proxy of proxies) {
                    safeTransactions.push(encodeTransaction(
                        0,
                        proxyAdmin.address,
                        0,
                        proxyAdmin.interface.encodeFunctionData("upgrade", [proxy, newImplementationAddress])
                    ));
                }
            }
        }
    );
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}
