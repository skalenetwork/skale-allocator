import chalk from "chalk";
import { ethers } from "hardhat";
import { skaleContracts } from "@skalenetwork/skale-contracts-ethers-v5";
import axios from "axios";

interface Explorer {
    url: string;
    hostedBy: string;
}

interface ChainData {
    name: string;
    explorers: Explorer[];
}

interface ChainsResponse {
    [key: string]: ChainData;
}

interface EscrowItem {
    to?: {
        hash: string;
    };
}

interface EscrowResponse {
    items: EscrowItem[];
    next_page_params: Record<string, unknown> | null;
}

async function getSkaleManagerInstance() {
    if (!process.env.SKALE_MANAGER_ADDRESS) {
        console.log(chalk.red("Specify desired skale-manager instance"));
        console.log(chalk.red("Set instance alias or SkaleManager address to SKALE_MANAGER_ADDRESS environment variable"));
        process.exit(1);
    }
    const network = await skaleContracts.getNetworkByProvider(ethers.provider);
    const project = network.getProject("skale-manager");
    return await project.getInstance(process.env.SKALE_MANAGER_ADDRESS);
}

async function getSkaleAllocatorInstance() {
    if (!process.env.SKALE_ALLOCATOR_ADDRESS) {
        console.log(chalk.red("Specify desired skale-allocator instance"));
        console.log(chalk.red("Set instance alias or Allocator address to SKALE_ALLOCATOR_ADDRESS environment variable"));
        process.exit(1);
    }
    const network = await skaleContracts.getNetworkByProvider(ethers.provider);
    const project = network.getProject("skale-allocator");
    return await project.getInstance(process.env.SKALE_ALLOCATOR_ADDRESS);
}

async function getExplorerUrl(chainId: number) {
    const response = await axios.get<ChainsResponse>("https://chains.blockscout.com/api/chains");
    const chainData = response.data[chainId.toString()];
    if (!chainData || !chainData.explorers || chainData.explorers.length === 0) {
        throw new Error(`No explorer found for chain ID ${chainId}`);
    }
    const apiUrl = `${chainData.explorers[0].url}api/v2`;
    return apiUrl;
}

function serializeParams(params: Record<string, unknown>): string {
    return Object.entries(params)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => value === null
            ? `${key}=null`
            : `${key}=${encodeURIComponent(String(value))}`)
        .join('&');
}

async function getEscrowAddresses(apiUrl: string, tokenAddress: string, allocatorAddress: string) {
    const escrowAddresses: string[] = [];
    let nextPageParams: Record<string, unknown> | null = null;

    const baseParams = {
        transaction_types: 'ERC-20',
        address_relation: 'or',
        token_contract_address_hashes_to_include: tokenAddress,
        token_contract_symbols_to_include: 'SKL',
        from_address_hashes_to_include: allocatorAddress
    }
    console.log("Fetching escrow addresses...")
    do {
        const params: Record<string, unknown> = { ...baseParams, ...nextPageParams };
        const response = await axios.get<EscrowResponse>(`${apiUrl}/advanced-filters`, {
            params,
            paramsSerializer: serializeParams
        });
        const items = response.data.items || [];
        items.forEach((item) => {
            if (item.to?.hash) {
                escrowAddresses.push(ethers.utils.getAddress(item.to.hash));
            }
        });
        console.log(`Fetched ${escrowAddresses.length} escrow addresses`);
        nextPageParams = response.data.next_page_params;
    } while (nextPageParams);

    return escrowAddresses;
}

async function validateEscrows(escrowAddresses: string[]) {
    console.log("Validating escrow addresses...")
    await Promise.all(escrowAddresses.map(async (address) => {
        const code = await ethers.provider.getCode(address);
        if (code === "0x") {
            console.error(`Error: ${address} is not a contract address`);
            throw Error("Wrong Escrow list: found non-contract address");
        }
    }));
    console.log("Escrow addresses validated successfully");
}

export async function fetchEscrowAddresses() {
    const skaleManagerInstance = await getSkaleManagerInstance();
    const skaleAllocatorInstance = await getSkaleAllocatorInstance();
    const skaleToken = await skaleManagerInstance.getContract("SkaleToken");
    const allocator = await skaleAllocatorInstance.getContract("Allocator");
    const chainId = (await ethers.provider.getNetwork()).chainId;

    const apiUrl = await getExplorerUrl(chainId);
    const escrowAddresses = await getEscrowAddresses(apiUrl, skaleToken.address, allocator.address);

    await validateEscrows(escrowAddresses);
    return escrowAddresses;
}

async function main() {
    const escrowAddresses = await fetchEscrowAddresses();

    console.log(chalk.green(`\nFound ${escrowAddresses.length} escrow addresses:`));
    escrowAddresses.forEach((address, index) => {
        console.log(`${index + 1}. ${address}`);
    });
}


if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
