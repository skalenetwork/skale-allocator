import { skaleContracts } from "@skalenetwork/skale-contracts-ethers-v6";
import { ethers } from "hardhat";
import chalk from "chalk";
import { Allocator, ContractManager } from "../typechain-types";
import { Transaction } from "ethers";
import { TransparentProxyUpgrader } from "@skalenetwork/upgrade-tools/dist/src/upgraders/transparentProxyUpgrader";
import { V4TransparentProxyUpgrader } from "@skalenetwork/upgrade-tools/dist/src/upgraders/v4TransparentProxyUpgrader";
import { AbstractTransparentProxyUpgrader, EoaSubmitter, getVersion, SafeSubmitter, verify } from "@skalenetwork/upgrade-tools";
import { NonceProvider } from "@skalenetwork/upgrade-tools/dist/src/nonceProvider";
import {getImplementationAddress, isDevelopmentNetwork} from "@openzeppelin/upgrades-core";
import { fetchEscrowAddresses } from "../scripts/getEscrows";

interface DescribedTransaction {
    tx: Transaction;
    description: string;
}

const getOwner = async (allocatorAddress: string, escrows: string[]): Promise<string> => {
    const owners = [];
    const allocatorOwner = await (await AbstractTransparentProxyUpgrader.getProxyAdmin(allocatorAddress)).owner();
    owners.push(allocatorOwner);
    for (const escrowAddress of escrows) {
        const escrowOwner = await (await AbstractTransparentProxyUpgrader.getProxyAdmin(escrowAddress)).owner();
        owners.push(escrowOwner);
    }
    const uniqueOwners = Array.from(new Set(owners));
    if (uniqueOwners.length !== 1) {
        throw new Error(`Multiple owners found: ${uniqueOwners.join(", ")}`);
    }
    console.log(`Found unique owner: ${uniqueOwners[0]}`);
    return uniqueOwners[0];
}

const getUpgrader = async (
    contractName: string,
    proxyAddress: string,
    nonceProvider: NonceProvider
): Promise<TransparentProxyUpgrader | V4TransparentProxyUpgrader> => {
    const admin = await AbstractTransparentProxyUpgrader.getProxyAdmin(proxyAddress);
    const version = await AbstractTransparentProxyUpgrader.getProxyAdminVersion(admin);
    const version5 = "5.0.0";
    if (version === version5) {
        console.log(`${contractName} Proxy admin version: ${version}`);
        return new TransparentProxyUpgrader({contractName, proxyAddress, proxyAdmin: admin, nonceProvider});
    }
    else if (version !== null) throw new Error(`Unsupported proxy admin version: ${version}`);
    console.log(`${contractName} Proxy admin version: v4 or lower`);
    return new V4TransparentProxyUpgrader({contractName, proxyAddress, proxyAdmin: admin, nonceProvider});
}

const upgradeAllocator = async (
    allocatorAddress: string,
    nonceProvider: NonceProvider
): Promise<{txs: DescribedTransaction[], newImplementation: string}> => {
    console.log(chalk.blue(`Upgrading Allocator at address: ${allocatorAddress}`));
    const upgrader = await getUpgrader("Allocator", allocatorAddress, nonceProvider);
    await upgrader.deployNewImplementation();
    if (!upgrader.needsUpgrade()) {
        console.log(chalk.yellow("No upgrade needed for Allocator."));
        return {txs: [], newImplementation: ""};
    }
    const upgradeTx = await upgrader.getUpgradeTransaction();

    // Decode the transaction to show what it's calling
    const proxyAdminInterface = new ethers.Interface([
        "function upgrade(address proxy, address implementation)",
        "function upgradeAndCall(address proxy, address implementation, bytes data)"
    ]);
    try {
        const decoded = proxyAdminInterface.parseTransaction({ data: upgradeTx.data! });
        console.log(chalk.green(`Decoded Allocator upgrade transaction:`));
        console.log(chalk.green(`  Method: ${decoded?.name}`));
        console.log(chalk.green(`  To (ProxyAdmin): ${upgradeTx.to}`));
        decoded?.args.forEach((arg, i) => {
            console.log(chalk.green(`  Arg ${i}: ${arg}`));
        });
    } catch (e) {
        console.log(chalk.yellow(`Could not decode upgrade transaction: ${e}`));
    }

    const newImpl = await ethers.resolveAddress(await upgrader.getNewImplementationAddress());
    return {
        txs: [{
            tx: upgradeTx,
            description: `Upgrade Allocator proxy at ${allocatorAddress} to implementation ${newImpl}`
        }],
        newImplementation: newImpl
    };
}

const upgradeEscrows = async (
    contractManager: ContractManager,
    escrowAddresses: string[],
    nonceProvider: NonceProvider
) : Promise<{txs: DescribedTransaction[], newImplementation: string}> => {
    const upgradeTransactions: DescribedTransaction[] = [];
    // Ensure all have the same implementation & proxyAdmin
    let expectedImplementation: string;
    try {
        expectedImplementation = await contractManager.getContract("EscrowImplementation");
    } catch (error) {
        console.log(error);
        console.log("ContractManager does not have EscrowImplementation recorded, fetching from first Escrow proxy");
        const escrowAddress = escrowAddresses[0];
        expectedImplementation = await getImplementationAddress(ethers.provider, escrowAddress);
        console.log(`Fetched implementation address: ${expectedImplementation}`);
    }
    const expectedProxyAdminAddress = await contractManager.getContract("ProxyAdmin");
    for (const escrowAddress of escrowAddresses) {
        const implementation = await getImplementationAddress(ethers.provider, escrowAddress);
        const admin = await AbstractTransparentProxyUpgrader.getProxyAdmin(escrowAddress);
        const adminAddress = await admin.getAddress();
        if (expectedProxyAdminAddress !== adminAddress) {
            throw new Error(
                `Escrow at address ${escrowAddress} has a different proxy admin \
                 (${adminAddress}) than expected (${expectedProxyAdminAddress})`
            );
        }
        if (expectedImplementation !== implementation) {
            throw new Error(
                `Escrow at address ${escrowAddress} has a different \
                implementation (${implementation}) than expected (${expectedImplementation})`
            );
        }
    }
    console.log(chalk.blue(`Upgrading ${escrowAddresses.length} Escrow contracts.`));
    const upgrader = await getUpgrader("Escrow", escrowAddresses[0], nonceProvider);

    // Deploy if needed and update manifest - checks upgrade is safe
    await upgrader.deployNewImplementation();
    // Check if new contract was deployed
    if (!upgrader.needsUpgrade()) {
        console.log(chalk.yellow("No upgrade needed for Escrows."));
        return {txs: upgradeTransactions, newImplementation: ""};
    }
    const implementationAddress = await upgrader.getNewImplementationAddress();

    // Compatible with versions v4 and v5 of ProxyAdmins ! All Escrows are v4 or lower here (1 admin for all)
    const proxyAdminInterface = new ethers.Interface([
        "function upgradeAndCall(address proxy, address implementation, bytes data)"
    ]);
    const resolvedImpl = await ethers.resolveAddress(implementationAddress);
    for (const escrowAddress of escrowAddresses) {
        upgradeTransactions.push({
            tx: Transaction.from({
                to: expectedProxyAdminAddress,
                data: proxyAdminInterface.encodeFunctionData(
                    "upgradeAndCall",
                    [escrowAddress, implementationAddress, "0x"]
                )
            }),
            description: `Upgrade Escrow proxy at ${escrowAddress} to implementation ${resolvedImpl}`
        })
    }
    return {txs: upgradeTransactions, newImplementation: resolvedImpl};

}


const setVersion = async (newVersion: string, allocator: Allocator): Promise<DescribedTransaction> => {
    const allocatorAddress = await allocator.getAddress();
    return {
        tx: Transaction.from({
            to: allocatorAddress,
            data: allocator.interface.encodeFunctionData("setVersion", [newVersion])
        }),
        description: `Set Allocator version to ${newVersion}`
    };
}

async function main() {
    const [deployer] = await ethers.getSigners();
    const nonceProvider = new NonceProvider(await ethers.provider.getTransactionCount(deployer));
    if (!process.env.SKALE_MANAGER_ADDRESS) {
        console.log(chalk.red("Specify desired SKALE_MANAGER_ADDRESS in .env"));
        throw new Error("SKALE_MANAGER_ADDRESS not specified");
    }
    if (!process.env.SKALE_ALLOCATOR_ADDRESS) {
        console.log(chalk.red("Specify desired SKALE_ALLOCATOR_ADDRESS in .env"));
        throw new Error("SKALE_ALLOCATOR_ADDRESS not specified");
    }

    const fromVersion = "2.2.2";
    const network = await skaleContracts.getNetworkByProvider(ethers.provider);
    const skaleManagerProject = network.getProject("skale-manager");
    const skaleManagerInstance = await skaleManagerProject.getInstance(process.env.SKALE_MANAGER_ADDRESS);
    const contractManager = await skaleManagerInstance.getContract("ContractManager") as ContractManager;
    const allocatorAddress = await contractManager.getContract("Allocator");
    if (allocatorAddress.toLowerCase() !== process.env.SKALE_ALLOCATOR_ADDRESS.toLowerCase()) {
        throw new Error(`SKALE_ALLOCATOR_ADDRESS (${process.env.SKALE_ALLOCATOR_ADDRESS}) does not match ContractManager record (${allocatorAddress})`);
    }
    console.log(`Current SkaleAllocator address: ${allocatorAddress}`);
    const allocator = await ethers.getContractAt("Allocator", allocatorAddress) as Allocator;

    // Verify version
    const currentVersion = await allocator.version();
    console.log(`Current Allocator version: ${currentVersion}`);
    console.log(`Expected Version: ${fromVersion}`);

    if (!currentVersion.includes(fromVersion)) {
        throw new Error(`Allocator version (${currentVersion}) does not match expected version (${fromVersion})`);
    }
    const transactions: DescribedTransaction[] = [];

    const allocatorUpgrade = await upgradeAllocator(allocatorAddress, nonceProvider);
    if (allocatorUpgrade.txs.length > 0) {
        transactions.push(...allocatorUpgrade.txs);
    }

    const escrowAddresses: string[] = [];
    // Always add first mock escrow
    escrowAddresses.push(await contractManager.getContract("Escrow"));
    try {
        const remoteEscrowAddresses = await fetchEscrowAddresses();
        escrowAddresses.push(...remoteEscrowAddresses);
    } catch (error) {
        if (await isDevelopmentNetwork(ethers.provider)) {
            console.log(chalk.yellow("Skipping fetching escrow addresses on development network"));
        } else {
            throw error;
        }
    }
    console.log(`Total Escrow contracts to consider for upgrade: ${escrowAddresses.length}`);
    console.log(escrowAddresses);

    const escrowUpgrade = await upgradeEscrows(contractManager, escrowAddresses, nonceProvider);
    transactions.push(...escrowUpgrade.txs);

    // Set New implementation in contractManager
    if (transactions.length === 0) {
        console.log("Skipping changing EscrowImplementation in ContractManager - no upgrades needed");
    }
    else {
        const contractManagerAddress = await contractManager.getAddress();
        transactions.push({
            tx: Transaction.from({
                to: contractManagerAddress,
                data: contractManager.interface.encodeFunctionData("setContractsAddress", [
                    "EscrowImplementation",
                    escrowUpgrade.newImplementation
                ])
            }),
            description: `Set EscrowImplementation in ContractManager to ${escrowUpgrade.newImplementation}`
        });
    }

    // Set Version
    const newVersion = await getVersion();
    console.log(chalk.blue(`Setting Allocator version to ${newVersion}`));
    const setVersionTx = await setVersion(newVersion, allocator);
    transactions.push(setVersionTx);

    // Print all transaction descriptions
    console.log(chalk.cyan("\n=== Transaction Summary ==="));
    transactions.forEach((describedTx, index) => {
        console.log(chalk.cyan(`${index + 1}. ${describedTx.description}`));
    });
    console.log(chalk.cyan("==========================\n"));

    const owner = await getOwner(allocatorAddress, escrowAddresses);
    const isMultisig = (await ethers.provider.getCode(owner)).length > 100;
    const rawTransactions = transactions.map(t => t.tx);
    if (isMultisig) {
        console.log(chalk.yellow(`Owner ${owner} is a multisig. Proposing transactions to multisig...`));
        const submitter = new SafeSubmitter(owner, await ethers.provider.getNetwork().then(n => n.chainId));
        await submitter.submit(rawTransactions);
    }
    else {
        console.log(chalk.blue(`Owner ${owner} is an EOA. Sending transactions directly...`));
        const submitter = new EoaSubmitter();
        await submitter.submit(rawTransactions);
    }

    // Verify new implementations
    if (escrowUpgrade.txs.length > 0)
        await verify("Escrow", escrowUpgrade.newImplementation);

    if (allocatorUpgrade.txs.length > 0) {
        await verify("Allocator", allocatorUpgrade.newImplementation);
    }
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}
