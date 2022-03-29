import { exec as asyncExec } from "child_process";
import { ethers, upgrades } from "hardhat";
import { promises as fs } from "fs";
import * as syncFs from "fs";
import util from 'util';
const exec = util.promisify(asyncExec);

export function getContractKeyInAbiFile(contract: string) {
    return contract.replace(/([a-zA-Z])(?=[A-Z])/g, '$1_').toLowerCase();
}

async function main() {
    if (!process.env.MANIFEST || !process.env.VERSION) {
        console.log("Example of usage:");
        console.log("MANIFEST=.openzeppelin/mainnet.json VERSION=2.2.0-stable.0 npx hardhat run scripts/update_manifest.json.ts --network localhost")
        console.log();
        console.log("IMPORTANT! openzeppelin-cli-export.json must correspond the manifest file");
        process.exit(1);
    }

    const manifestFilename = process.env.MANIFEST;
    const version = process.env.VERSION;
    const exportFilename = "openzeppelin-cli-export.json";

    const deployedDir = `deployed-sk-al-${Math.round(Math.random() * 1e6)}`

    console.log(`Clone version ${version}`);
    await exec(`git clone --branch ${version} https://github.com/skalenetwork/skale-allocator.git ${deployedDir}`);
    console.log("Copy contracts");
    await exec("mv contracts contracts_tmp");
    await exec(`cp -r ${deployedDir}/contracts ./`);
    await exec(`rm -r --interactive=never ${deployedDir}`)
    console.log("Prepare contracts");

    console.log("Deploy contracts");
    await exec(`rm .openzeppelin/unknown-31337.json || rm .openzeppelin/unknown-1337.json || true`);
    await exec(`VERSION=${version} npx hardhat run migrations/deploy.ts --network localhost`);

    await exec("rm -r contracts");
    await exec("mv contracts_tmp contracts");

    let newManifestFilename;
    if (syncFs.existsSync(".openzeppelin/unknown-31337.json")) {
        newManifestFilename = ".openzeppelin/unknown-31337.json";
    } else if (syncFs.existsSync(".openzeppelin/unknown-1337.json")) {
        newManifestFilename = ".openzeppelin/unknown-1337.json";
    } else {
        throw Error("Can't find new manifest file");
    }

    const manifest = JSON.parse(await fs.readFile(manifestFilename, "utf-8"));
    const newManifest = JSON.parse(await fs.readFile(newManifestFilename, "utf-8"));
    const cliExport = JSON.parse(await fs.readFile(exportFilename, "utf-8"));
    const artifacts = JSON.parse(await fs.readFile(`data/skale-allocator-${version}-localhost-abi.json`, "utf-8"));
    const network = manifestFilename.substr(0, manifestFilename.lastIndexOf(".")).split("/").pop() as string;

    interface ImplementationInterface {
        address: string,
        layout: object
    }

    const proxyAdmin = await upgrades.admin.getInstance();
    for (const [_, value] of Object.entries(manifest.impls)) {
        const contract = value as ImplementationInterface;
        const searchResult = Object.entries(
            cliExport
                .networks[network]
                .proxies
        ).find(([, aliasValue]) => {
            const _proxies = aliasValue as {implementation: string}[];
            return _proxies[0].implementation === contract.address;
        });
        if (searchResult) {
            const [alias, ] = searchResult;
            const contractName = alias.split("/").pop() as string;

            const proxyAddress = artifacts[getContractKeyInAbiFile(contractName) + "_address"];
            if (proxyAddress) {
                const newContractFactory = await ethers.getContractFactory(contractName);
                const newContractInstance = newContractFactory.attach(artifacts[getContractKeyInAbiFile(contractName) + "_address"]);
                const newContractImplementation = await proxyAdmin.getProxyImplementation(newContractInstance.address);

                const implementationSearch = Object.entries(newManifest.impls).find(([, _implementation]) => {
                    const implementation = _implementation as ImplementationInterface;
                    return implementation.address === newContractImplementation;
                });

                if (implementationSearch) {
                    const implementation = implementationSearch[1] as ImplementationInterface;

                    contract.layout = implementation.layout;

                } else {
                    throw Error(`There is no implementation for ${contractName} contract`);
                }
            } else {
                throw Error(`Contract ${contractName} was not deployed`);
            }
        } else {
            const layout = contract.layout as any;
            if (layout.storage[layout.storage.length - 1].contract === "ContractManager") {
                continue;
            } else {
                throw Error(`Can't find information about implementation at address ${contract.address} in openzeppelin-cli-export.json`);
            }
        }
    }

    const updatedManifestFilename = manifestFilename.split("/").map( (name, index, all) => {
        if (index < all.length - 1) {
            return name;
        } else {
            return "new-" + name;
        }}).join("/");
    await fs.writeFile(updatedManifestFilename, JSON.stringify(manifest, null, 2));
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}