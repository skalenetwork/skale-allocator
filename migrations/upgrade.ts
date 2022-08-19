import chalk from "chalk";
import { contracts } from "./deploy";
import { ethers } from "hardhat";
import { Allocator } from "../typechain-types";
import { upgrade, SkaleABIFile, encodeTransaction, getContractKeyInAbiFile } from "@skalenetwork/upgrade-tools";

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