import chalk from "chalk";
import { ethers } from "hardhat";
import { skaleContracts } from "@skalenetwork/skale-contracts-ethers-v6";
import axios from "axios";

interface ChainsResponse {
    [key: string]: {
        explorers: { url: string }[];
    };
}

interface EscrowResponse {
    items: { to: { hash: string } }[];
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

async function getExplorerUrl(chainId: bigint | number): Promise<string> {
    chainId = Number(chainId);
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
            escrowAddresses.push(ethers.getAddress(item.to.hash));
        });
        console.log(`Fetched ${escrowAddresses.length} escrows`);
        nextPageParams = response.data.next_page_params;
    } while (nextPageParams);

    return escrowAddresses;
}

// If using very strict endpoint, adjust chunk size and delay accordingly
const VALIDATION_CHUNK_SIZE = 50;
const VALIDATION_DELAY_MS = 1000; // In milliseconds

async function validateEscrows(escrowAddresses: string[]) {
    console.log("Validating escrows...")
    console.log(`Validating ${escrowAddresses.length} escrows...`);
    for (let i = 0; i < escrowAddresses.length; i += VALIDATION_CHUNK_SIZE) {
        const chunk = escrowAddresses.slice(i, i + VALIDATION_CHUNK_SIZE);
        await Promise.all(chunk.map(async (address) => {
            try {
                const escrow = await ethers.getContractAt("Escrow", address);
                await escrow.BENEFICIARY_ROLE();
            } catch (error) {
                console.error(`Error: ${address} is not a valid Escrow contract`);
                console.error(error);
                throw Error(`Wrong Escrow list: ${address} is not a valid Escrow contract`);
            }
        }));
        console.log(`Validated ${Math.min(i + VALIDATION_CHUNK_SIZE, escrowAddresses.length)}/${escrowAddresses.length} escrows`);
        if (i + VALIDATION_CHUNK_SIZE < escrowAddresses.length) {
            await new Promise(resolve => setTimeout(resolve, VALIDATION_DELAY_MS));
        }
    }
    console.log("Escrows validated successfully");
}

export async function fetchEscrowAddresses() {
    const skaleManagerInstance = await getSkaleManagerInstance();
    const skaleAllocatorInstance = await getSkaleAllocatorInstance();
    const skaleToken = await skaleManagerInstance.getContract("SkaleToken");
    const allocator = await skaleAllocatorInstance.getContract("Allocator");
    const chainId = BigInt(process.env.CHAIN_ID ?? (await ethers.provider.getNetwork()).chainId);

    const apiUrl = await getExplorerUrl(chainId);
    const escrowAddresses = await getEscrowAddresses(apiUrl, await skaleToken.getAddress(), await allocator.getAddress());

    await validateEscrows(escrowAddresses);
    return escrowAddresses;
}

async function main() {
    const escrowAddresses = await fetchEscrowAddresses();

    console.log(chalk.green(`\nFound ${escrowAddresses.length} escrows:`));
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
