import util from 'util';
import chalk from "chalk";
import { contracts } from "./deploy";
import { promises as fs, existsSync } from "fs";
import { exec as asyncExec } from "child_process";
import hre, { ethers } from "hardhat";
// import { getManifestAdmin } from "@openzeppelin/hardhat-upgrades/dist/admin";
import { ProxyAdmin, Allocator, Escrow } from "../typechain-types";
// import { upgrade, verify, SkaleABIFile, encodeTransaction, getContractKeyInAbiFile } from "@skalenetwork/upgrade-tools";
import { verify } from "@skalenetwork/upgrade-tools";

const exec = util.promisify(asyncExec);

type SkaleABIFile = { [key: string]: string | any[] };

function getContractKeyInAbiFile(contract: string) {
    return contract.replace(/([a-zA-Z])(?=[A-Z])/g, '$1_').toLowerCase();
}

async function getAllocator(abi: SkaleABIFile): Promise<Allocator> {
    return ((await ethers.getContractFactory("Allocator")).attach(
        abi[getContractKeyInAbiFile("Allocator") + "_address"] as string
    )) as unknown as Allocator;
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
    /*
    safeTransactions.push(encodeTransaction(
        0,
        await allocator.getAddress(),
        0,
        allocator.interface.encodeFunctionData("setVersion", [newVersion]),
    ));
    */
}

async function main() {
    /*
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

            const proxyAdmin = await getManifestAdmin(hre) as unknown as ProxyAdmin;
            const [deployer] = await ethers.getSigners();

            if (production) {
                if (!process.env.ABI) {
                    console.log(chalk.red("Set path to file with ABI and addresses to ABI environment variables"));
                    return;
                }
                if (!process.env.NETWORK) {
                    console.log(chalk.red("Set network type. Example NETWORK=mainnet"));
                    return;
                }
                if (!process.env.ETHERSCAN) {
                    console.log(chalk.red("Set ETHERSCAN api key"));
                    return;
                }
                await exec(
                    `ABI=${process.env.ABI} ` +
                    `NETWORK=${process.env.NETWORK} ` +
                    `ETHERSCAN=${process.env.ETHERSCAN} ` +
                    `python3 ${__dirname}/../scripts/get_escrows.py`
                );

                if (!existsSync(__dirname + "/../data/proxy_list.txt")) {
                    console.log("PLEASE Provide a proxy_list.txt which contains all escrow proxy addresses.");
                    process.exit(1);
                }

                const proxies = (await fs.readFile(__dirname + "/../data/proxy_list.txt", "utf-8"))
                    .split('\n')
                    .map((line) => line.trim())
                    .filter((line) => line !== "")


                console.log("Deploy implementation");
                const escrowFactory = (await ethers.getContractFactory("Escrow")).connect(deployer);
                const escrow = await escrowFactory.deploy({
                    maxFeePerGas: maxFeePerGas,
                    maxPriorityFeePerGas: maxPriorityFeePerGas
                }) as unknown as Escrow;
                console.log("Deploy transaction:");
                console.log("https://etherscan.io/tx/" + escrow.deploymentTransaction()?.hash)
                console.log("New Escrow address:", await escrow.getAddress());
                await escrow.waitForDeployment();
                await verify("Escrow", await escrow.getAddress());

                const newImplementationAddress = await escrow.getAddress();

                const implementations = await Promise.all(proxies.map(async (proxy) => {
                    return await proxyAdmin.getProxyImplementation(proxy);
                }));

                const distinctImplementations = [...new Set(implementations)];
                if (distinctImplementations.length !== 1) {
                    console.log("Upgraded Escrows have different implementations. Check if Escrow list is correct.");
                    console.log("Present implementations:");
                    distinctImplementations.forEach((implementation) => console.log(implementation));
                    throw Error("Wrong Escrow list");
                }

                for (const proxy of proxies) {
                    // safeTransactions.push(encodeTransaction(
                    //     0,
                    //     await proxyAdmin.getAddress(),
                    //     0,
                    //     proxyAdmin.interface.encodeFunctionData("upgrade", [proxy, newImplementationAddress])
                    // ));
                }
            }
        }
    );
    */
    console.log("Upgrade script is disabled due to upgrade-tools version mismatch. Please update it to use Upgrader class.");
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}
