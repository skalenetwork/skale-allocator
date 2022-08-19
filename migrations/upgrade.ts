import util from 'util';
import chalk from "chalk";
import { contracts } from "./deploy";
import { promises as fs, existsSync } from "fs";
import { exec as asyncExec } from "child_process";
import hre, { ethers } from "hardhat";
import { getManifestAdmin } from "@openzeppelin/hardhat-upgrades/dist/admin";
import { ProxyAdmin, Allocator } from "../typechain-types";
import { upgrade, verify, SkaleABIFile, encodeTransaction, getContractKeyInAbiFile } from "@skalenetwork/upgrade-tools";

const exec = util.promisify(asyncExec);

interface CustomEscrows {
    [escrow: string]: {
        oldImplementation: string
        beneficiary: string
    }
}

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

async function upgradeCustomEscrows(
    proxyAdmin: ProxyAdmin,
    proxies: string[],
    newImplementationAddress: string,
    safeTransactions: string[]
) : Promise<void> {
    const escrowFactory = await ethers.getContractFactory("Escrow");
    const escrows = JSON.parse(await fs.readFile(__dirname + "/../data/customEscrows.json", "utf-8")) as CustomEscrows;
    for (const escrow in escrows) {
        if (escrows[escrow].oldImplementation == await proxyAdmin.getProxyImplementation(escrow)) {
            if (escrows[escrow].beneficiary == "") {
                throw Error("Beneficiary wasn't found");
            }
            const encodedReinitialize = escrowFactory.interface.encodeFunctionData("reinitialize", [escrows[escrow].beneficiary]);
            safeTransactions.push(encodeTransaction(
                0,
                proxyAdmin.address,
                0,
                proxyAdmin.interface.encodeFunctionData("upgradeAndCall", [escrow, newImplementationAddress, encodedReinitialize])
            ));
        }
        const index = proxies.indexOf(escrow);
        if (~index) {
            proxies.splice(index, 1);
        }
    }
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
        async () => {
            // initialization
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