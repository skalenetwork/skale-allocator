import { contracts, getContractKeyInAbiFile } from "./deploy";
import { createMultiSendTransaction, sendSafeTransaction } from "./tools/gnosis-safe";
import { promises as fs, existsSync } from "fs";
import { encodeTransaction } from "./tools/multiSend";
import { getManifestAdmin } from "@openzeppelin/hardhat-upgrades/dist/admin";
import { getImplementationAddress } from "@openzeppelin/upgrades-core";
import hre, { upgrades } from "hardhat";
import { ethers, network } from "hardhat";
import chalk from "chalk";
import { Allocator, SafeMock } from "../typechain";
import { getVersion } from "./tools/version";
import { getAbi } from "./tools/abi";
import { verify } from "./tools/verification";
import { exec as asyncExec } from "child_process";
import util from 'util';
const exec = util.promisify(asyncExec);


async function upgrade(targetVersion: string, contractNamesToUpgrade: string[]) {
    if (!process.env.ABI) {
        console.log(chalk.red("Set path to file with ABI and addresses to ABI environment variables"));
        return;
    }

    let production = false;
    if (process.env.PRODUCTION === "true") {
        production = true;
    }

    let maxFeePerGasGWei = "100";
    if (process.env.MAX_FEE_GWEI) {
        maxFeePerGasGWei = process.env.MAX_FEE_GWEI;
    }
    let maxPriorityFeePerGasGWei = "1";
    if (process.env.MAX_PRIORITY_FEE_GWEI) {
        maxPriorityFeePerGasGWei = process.env.MAX_PRIORITY_FEE_GWEI
    }

    const abiFilePath = process.env.ABI;
    const abi = JSON.parse(await fs.readFile(abiFilePath, "utf-8"));

    const proxyAdmin = await getManifestAdmin(hre);

    const allocatorName = "Allocator";
    const allocator = ((await ethers.getContractFactory(allocatorName)).attach(
        abi[getContractKeyInAbiFile(allocatorName) + "_address"] as string
    )) as Allocator;

    let deployedVersion = "";
    try {
        deployedVersion = await allocator.version();
    } catch {
        console.log(chalk.red("Can't read deployed version"));
    }
    const version = await getVersion();
    if (deployedVersion) {
        if (deployedVersion !== targetVersion) {
            console.log(chalk.red(`This script can't upgrade version ${deployedVersion} to ${version}`));
            process.exit(1);
        }
    } else {
        console.log(chalk.yellow("Can't check currently deployed version of skale-allocator"));
    }
    console.log(`Will mark updated version as ${version}`);


    const [deployer] = await ethers.getSigners();
    let safe = await proxyAdmin.owner();
    const safeTransactions: string[] = [];
    let safeMock;
    if (await ethers.provider.getCode(safe) === "0x") {
        console.log("Owner is not a contract");
        if (deployer.address !== safe) {
            console.log(chalk.red("Used address does not have permissions to upgrade skale-allocator"));
            process.exit(1);
        }
        console.log(chalk.blue("Deploy SafeMock to simulate upgrade via multisig"));
        const safeMockFactory = await ethers.getContractFactory("SafeMock");
        safeMock = (await safeMockFactory.deploy()) as SafeMock;
        await safeMock.deployTransaction.wait();

        console.log(chalk.blue("Transfer ownership to SafeMock"));
        safe = safeMock.address;
        await (await proxyAdmin.transferOwnership(safe)).wait();
        for (const contractName of contractNamesToUpgrade) {
            const contractFactory = await ethers.getContractFactory(contractName);
            const contractAddress = abi[getContractKeyInAbiFile(contractName) + "_address"] as string;
            const contract = contractFactory.attach(contractAddress);
            console.log(chalk.blue(`Grant access to ${contractName}`));
            await (await contract.grantRole(await contract.DEFAULT_ADMIN_ROLE(), safe)).wait();
        }
    }

    // deploy new implementations
    const contractsToUpgrade: { proxyAddress: string, implementationAddress: string, name: string, abi: [] }[] = [];
    for (const contract of contractNamesToUpgrade) {
        if (contract === "Escrow" && production) {
            continue;
        }
        const contractFactory = await ethers.getContractFactory(contract);
        const proxyAddress = abi[getContractKeyInAbiFile(contract) + "_address"] as string;

        console.log(`Prepare upgrade of ${contract}`);
        const newImplementationAddress = await upgrades.prepareUpgrade(proxyAddress, contractFactory, { unsafeAllowRenames: true });
        const currentImplementationAddress = await getImplementationAddress(network.provider, proxyAddress);
        if (newImplementationAddress !== currentImplementationAddress) {
            contractsToUpgrade.push({
                proxyAddress,
                implementationAddress: newImplementationAddress,
                name: contract,
                abi: getAbi(contractFactory.interface)
            });
            await verify(contract, newImplementationAddress, []);
        } else {
            console.log(chalk.gray(`Contract ${contract} is up to date`));
        }
    }

    // Switch proxies to new implementations
    for (const contract of contractsToUpgrade) {
        if (contract.name === "Escrow" && production) {
            continue;
        }
        console.log(chalk.yellowBright(`Prepare transaction to upgrade ${contract.name} at ${contract.proxyAddress} to ${contract.implementationAddress}`));
        safeTransactions.push(encodeTransaction(
            0,
            proxyAdmin.address,
            0,
            proxyAdmin.interface.encodeFunctionData("upgrade", [contract.proxyAddress, contract.implementationAddress])));
        abi[getContractKeyInAbiFile(contract.name) + "_abi"] = contract.abi;
    }

    // switch implementation for Escrows in production mode
    if (production) {
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

        const implementations = await Promise.all(proxies.map(async (proxy) => {
            return await proxyAdmin.getProxyImplementation(proxy);
        }));

        const distinctImplementations = [...new Set(implementations)];
        if (distinctImplementations.length !== 1) {
            console.log("Upgraded Escrows have different implementations. Check if Escrow list is correct.");
            console.log("Present implementations:");
            distinctImplementations.forEach((implementation) => console.log);
            throw Error("Wrong Escrow list");
        }

        let newImplementationAddress;
        if (!process.env.NEW_IMPLEMENTATION) {
            console.log("Deploy implementation");
            const escrowFactory = (await ethers.getContractFactory("Escrow")).connect(deployer);
            const escrow = await escrowFactory.deploy({
                maxFeePerGas: ethers.utils.parseUnits(maxFeePerGasGWei, "gwei"),
                maxPriorityFeePerGas: ethers.utils.parseUnits(maxPriorityFeePerGasGWei, "gwei")
            });
            console.log("Deploy transaction:");
            console.log("https://etherscan.io/tx/" + escrow.deployTransaction.hash)
            console.log("New Escrow address:", escrow.address);
            await escrow.deployTransaction.wait();

            await verify("Escrow", escrow.address, []);

            newImplementationAddress = escrow.address;
        } else {
            newImplementationAddress = process.env.NEW_IMPLEMENTATION;
        }

        for (const proxy of proxies) {
            safeTransactions.push(encodeTransaction(
                0,
                proxyAdmin.address,
                0,
                proxyAdmin.interface.encodeFunctionData("upgrade", [proxy, newImplementationAddress])
            ));
        }
    }

    // write version
    safeTransactions.push(encodeTransaction(
        0,
        allocator.address,
        0,
        allocator.interface.encodeFunctionData("setVersion", [version]),
    ));

    await fs.writeFile(`data/transactions-${version}-${network.name}.json`, JSON.stringify(safeTransactions, null, 4));

    let privateKey = (network.config.accounts as string[])[0];
    if (network.config.accounts === "remote") {
        // Don't have an information about private key
        // Use random one because we most probable run tests
        privateKey = ethers.Wallet.createRandom().privateKey;
    }

    const safeTx = await createMultiSendTransaction(ethers, safe, privateKey, safeTransactions);
    if (!safeMock) {
        const chainId = (await ethers.provider.getNetwork()).chainId;
        await sendSafeTransaction(safe, chainId, safeTx);
    } else {
        console.log(chalk.blue("Send upgrade transactions to safe mock"));
        try {
            await (await deployer.sendTransaction({
                to: safeMock.address,
                value: safeTx.value,
                data: safeTx.data,
            })).wait();
        } finally {
            console.log(chalk.blue("Return ownership to wallet"));
            await (await safeMock.transferProxyAdminOwnership(proxyAdmin.address, deployer.address)).wait();
            if (await proxyAdmin.owner() === deployer.address) {
                await (await safeMock.destroy()).wait();
            } else {
                console.log(chalk.blue("Something went wrong with ownership transfer"));
                process.exit(1);
            }
        }
    }

    await fs.writeFile(`data/skale-allocator-${version}-${network.name}-abi.json`, JSON.stringify(abi, null, 4));

    console.log("Done");
}

async function main() {
    await upgrade(
        "2.2.0",
        contracts
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