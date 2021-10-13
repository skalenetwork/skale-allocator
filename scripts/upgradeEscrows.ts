import { createMultiSendTransaction, sendSafeTransaction } from "./tools/gnosis-safe";
// import { ethers } from "hardhat";
import { promises as fs } from "fs";
import { encodeTransaction } from "./tools/multiSend";
import env from "@nomiclabs/buidler";

async function main() {

    if (!process.env.SAFE || !process.env.PROXY_ADMIN || !process.env.NEW_IMPLEMENTATION || !process.env.PROXIES) {
        console.log("Example of usage:");
        console.log(
            "SAFE=0x13fD1622F0E7e50A87B79cb296cbAf18362631C0",
            "PROXY_ADMIN=0x9B1E4A9Fe5142346E1C51907f0583e6aC663b8A0",
            "NEW_IMPLEMENTATION=0xE61b48d00B9CA02dD9A3764A4d9d263CD7B4D351",
            "PROXIES=data/proxy_list.txt",
            "npx buidler run scripts/upgradeEscrows.ts --network custom");
        process.exit(1);
    }
    if (!process.env.PRIVATE_KEY) {
        console.log("Private key is not set");
        process.exit(1);
    }

    const safe = process.env.SAFE;
    let privateKey = process.env.PRIVATE_KEY;
    if (!privateKey.startsWith("0x")) {
        privateKey = "0x" + privateKey;
    }

    const proxyAdminFile = JSON.parse(await fs.readFile("node_modules/@openzeppelin/upgrades/build/contracts/ProxyAdmin.json", "utf-8"));
    const proxyAdmin = await env.ethers.getContractAt(proxyAdminFile["abi"], process.env.PROXY_ADMIN);

    const proxies = (await fs.readFile(process.env.PROXIES, "utf-8"))
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== "")

    const safeTransactions: string[] = []    
    for (const proxy of proxies) {
        safeTransactions.push(encodeTransaction(
            0,
            proxyAdmin.address,
            0,
            proxyAdmin.interface.encodeFunctionData("upgrade", [proxy, process.env.NEW_IMPLEMENTATION])
        ));
    }

    const safeTx = await createMultiSendTransaction(env.ethers, safe, privateKey, safeTransactions);
    const chainId = (await env.ethers.provider.getNetwork()).chainId;
    await sendSafeTransaction(safe, chainId, safeTx);
    console.log("Done");
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}