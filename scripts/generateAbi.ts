import {promises as fs} from 'fs';
import {contracts} from "../migrations/deploy";
import {ethers} from "hardhat";
import {getAbi, getVersion} from '@skalenetwork/upgrade-tools';

async function main() {
    const abi: {[name: string]: []} = {};
    for (const contractName of contracts) {
        console.log(`Load ABI of ${contractName}`);
        const factory = await ethers.getContractFactory(contractName);
        abi[contractName] = getAbi(factory.interface);
    }
    const version = await getVersion();
    const filename = `data/skale-allocator-${version}-abi.json`;
    console.log(`Save to ${filename}`)
    await fs.writeFile(filename, JSON.stringify(abi, null, 4));
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}
