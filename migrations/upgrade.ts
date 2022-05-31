import util from 'util';
import chalk from "chalk";
import { contracts } from "./deploy";
import { promises as fs, existsSync } from "fs";
import { exec as asyncExec } from "child_process";
import hre, { ethers, network, upgrades } from "hardhat";
import { getImplementationAddress } from "@openzeppelin/upgrades-core";
import { getManifestAdmin } from "@openzeppelin/hardhat-upgrades/dist/admin";
import { Permissions, ProxyAdmin } from "../typechain-types";
import { SkaleABIFile, verify, getAbi, getVersion, encodeTransaction, 
         createMultiSendTransaction, sendSafeTransaction, getContractKeyInAbiFile } from "@skalenetwork/upgrade-tools";

const exec = util.promisify(asyncExec);


type CustomEscrowsAction = (proxyAdmin: ProxyAdmin, proxies: string[], newImplementationAddress: string, safeTransactions: string[]) => Promise<void>;
interface CustomEscrows {
    [escrow: string]: {
        oldImplementation: string
        beneficiary: string
    }
}

async function upgrade(targetVersion: string, contractNamesToUpgrade: string[], upgradeCustomEscrows: CustomEscrowsAction) {
    if (!process.env.ABI) {
        console.log(chalk.red("Set path to file with ABI and addresses to ABI environment variables"));
        return;
    }

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

    const abiFilePath = process.env.ABI;
    const abi = JSON.parse(await fs.readFile(abiFilePath, "utf-8")) as SkaleABIFile;

    const proxyAdmin = await getManifestAdmin(hre) as ProxyAdmin;

    const allocatorName = "Allocator";
    const allocator = ((await ethers.getContractFactory(allocatorName)).attach(
        abi[getContractKeyInAbiFile(allocatorName) + "_address"] as string
    ));

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
        safeMock = (await safeMockFactory.deploy());
        await safeMock.deployTransaction.wait();

        console.log(chalk.blue("Transfer ownership to SafeMock"));
        safe = safeMock.address;
        await (await proxyAdmin.transferOwnership(safe)).wait();
        for (const contractName of contractNamesToUpgrade) {
            const contractFactory = await ethers.getContractFactory(contractName);
            const contractAddress = abi[getContractKeyInAbiFile(contractName) + "_address"] as string;
            const contract = contractFactory.attach(contractAddress) as Permissions;
            console.log(chalk.blue(`Grant access to ${contractName}`));
            await (await contract.grantRole(await contract.DEFAULT_ADMIN_ROLE(), safe)).wait();
        }
    }

    // deploy new implementations
    const contractsToUpgrade: { proxyAddress: string, implementationAddress: string, name: string, abi: [] }[] = [];
    for (const contract of contractNamesToUpgrade) {
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
        });
        console.log("Deploy transaction:");
        console.log("https://etherscan.io/tx/" + escrow.deployTransaction.hash)
        console.log("New Escrow address:", escrow.address);
        await escrow.deployTransaction.wait();
        await verify("Escrow", escrow.address, []);

        const newImplementationAddress = escrow.address;

        await upgradeCustomEscrows(proxyAdmin, proxies, newImplementationAddress, safeTransactions);

        const implementations = await Promise.all(proxies.map(async (proxy) => {
            return await proxyAdmin.getProxyImplementation(proxy);
        }));

        const distinctImplementations = [...new Set(implementations)];
        // change to !== 1 after upgrade
        if (distinctImplementations.length !== 2) {
            console.log("Upgraded Escrows have different implementations. Check if Escrow list is correct.");
            console.log("Present implementations:");
            distinctImplementations.forEach((implementation) => console.log(implementation));
            throw Error("Wrong Escrow list");
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
        contracts,
        async(proxyAdmin, proxies, newImplementationAddress, safeTransactions) => {
            const escrowFactory = await ethers.getContractFactory("Escrow");
            const escrows = JSON.parse(await fs.readFile(__dirname + "/../data/customEscrows.json", "utf-8")) as CustomEscrows;
            for (const escrow in escrows) {
                if (escrows.escrow.oldImplementation == await proxyAdmin.getProxyImplementation(escrow)) {
                    if (escrows.escrow.beneficiary == "") {
                        throw Error("Beneficiary wasn't found");
                    }
                    const encodedReinitialize = escrowFactory.interface.encodeFunctionData("reinitialize", [escrows.escrow.beneficiary]);
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