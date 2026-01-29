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

const getOwner = async (allocatorAddress: string, escrows: string[]): Promise<string> => {
    const owners = [];
    const allocatorOwner = await (await AbstractTransparentProxyUpgrader.getProxyAdmin(allocatorAddress)).getOwner();
    owners.push(allocatorOwner);
    for (const escrowAddress of escrows) {
        const escrowOwner = await (await AbstractTransparentProxyUpgrader.getProxyAdmin(escrowAddress)).getOwner();
        owners.push(escrowOwner);
    }
    const uniqueOwners = Array.from(new Set(owners));
    if (uniqueOwners.length !== 1) {
        throw new Error(`Multiple owners found: ${uniqueOwners.join(", ")}`);
    }
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
): Promise<{txs: Transaction[], newImplementation: string}> => {
    console.log(chalk.blue(`Upgrading Allocator at address: ${allocatorAddress}`));
    const upgrader = await getUpgrader("Allocator", allocatorAddress, nonceProvider);
    await upgrader.deployNewImplementation();
    if (!upgrader.needsUpgrade()) {
        console.log(chalk.yellow("No upgrade needed for Allocator."));
        return {txs: [], newImplementation: ""};
    }
    const upgradeTx = await upgrader.getUpgradeTransaction();
    return {
        txs: [upgradeTx],
        newImplementation: await ethers.resolveAddress(await upgrader.getNewImplementationAddress())
    };
}

const upgradeEscrows = async (
    contractManager: ContractManager,
    escrowAddresses: string[],
    nonceProvider: NonceProvider
) : Promise<{txs: Transaction[], newImplementation: string}> => {
    const upgradeTransactions: Transaction[] = [];
    // Ensure all have the same implementation & proxyAdmin
    const expectedImplementation = await contractManager.getContract("EscrowImplementation");
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
    const admin = await ethers.getContractAt("ProxyAdmin", expectedProxyAdminAddress);
    // upgradeAndCall is compatible with v4 and v5 ProxyAdmins!
    for (const escrowAddress of escrowAddresses) {
        upgradeTransactions.push(Transaction.from({
            to: expectedProxyAdminAddress,
            data: admin.interface.encodeFunctionData(
                "upgradeAndCall",
                [escrowAddress, implementationAddress, "0x"]
            )
        }))
    }
    return {txs: upgradeTransactions, newImplementation: await ethers.resolveAddress(implementationAddress)};

}


const setVersion = async (newVersion: string, allocator: Allocator): Promise<Transaction> => {
    return Transaction.from({
        to: await allocator.getAddress(),
        data: allocator.interface.encodeFunctionData("setVersion", [newVersion])
    });
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
    const transactions: Transaction[] = [];

    const allocatorUpgrade = await upgradeAllocator(allocatorAddress, nonceProvider);
    if (allocatorUpgrade.txs.length > 0) {
        transactions.push(...allocatorUpgrade.txs);
    }

    const escrowAddresses: string[] = [];
    // Always add first mock escrow
    escrowAddresses.push(...await contractManager.getContract("Escrow"));
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

    const escrowUpgrade = await upgradeEscrows(contractManager, escrowAddresses, nonceProvider);
    transactions.push(...escrowUpgrade.txs);

    // Set New implementation in contractManager
    if (transactions.length === 0) {
        console.log("Skipping changing EscrowImplementation in ContractManager - no upgrades needed");
    }
    else {
        const setEscrowImplTx = Transaction.from({
            to: await contractManager.getAddress(),
            data: contractManager.interface.encodeFunctionData("setContractsAddress", [
                "EscrowImplementation",
                escrowUpgrade.newImplementation
            ])
        });
        transactions.push(setEscrowImplTx);
    }

    // Set Version
    const newVersion = await getVersion();
    console.log(chalk.blue(`Setting Allocator version to ${newVersion}`));
    const setVersionTx = await setVersion(newVersion, allocator);
    transactions.push(setVersionTx);

    const owner = await getOwner(allocatorAddress, escrowAddresses);
    const isMultisig = (await ethers.provider.getCode(owner)).length > 100;
    if (isMultisig) {
        console.log(chalk.yellow(`Owner ${owner} is a multisig. Proposing transactions to multisig...`));
        const submitter = new SafeSubmitter(owner, await ethers.provider.getNetwork().then(n => n.chainId));
        await submitter.submit(transactions);
    }
    else {
        console.log(chalk.blue(`Owner ${owner} is an EOA. Sending transactions directly...`));
        const submitter = new EoaSubmitter();
        await submitter.submit(transactions);
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
