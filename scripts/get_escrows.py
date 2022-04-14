#!/usr/bin/env python

import requests
import json
import os
from web3.auto import w3

mainnet_url = 'https://api.etherscan.io/api'
rinkeby_url = 'https://api-rinkeby.etherscan.io/api'

def main():
    if os.environ['NETWORK'] == 'mainnet': 
        r = requests.get('https://raw.githubusercontent.com/skalenetwork/skale-network/master/releases/mainnet/skale-allocator/2.2.0/skale-allocator-2.2.0-mainnet-abi.json')
        allocator_abi = r.json()
        url = mainnet_url
        skale_token_address = "0x00c83aecc790e8a4453e5dd3b0b4b3680501a7a7"
    elif os.path.isfile(os.environ.get('ABI')) and os.environ['NETWORK'] == 'rinkeby':
        f = open(os.environ.get('ABI'))
        allocator_abi = json.load(f)
        f = open('./scripts/manager.json')
        manager_abi = json.load(f)
        url = rinkeby_url
        skale_token_address = manager_abi['skale_token_address']
    else:
        raise KeyError('Set NETWORK type or ABI filepath')
    
    
    payload = {
        'module': 'account',
        'action': 'tokentx',
        'contractaddress': skale_token_address,
        'address': allocator_abi['allocator_address'],
        'apikey': os.environ['ETHERSCAN']
    }
    headers = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.60 Safari/537.36'}

    r = requests.get(url, params=payload, headers=headers)
    transactions = r.json()['result']
    escrow_addresses = [tx['to'] for tx in transactions if tx['from'] == allocator_abi['allocator_address'].lower()]
    escrow_addresses = [w3.toChecksumAddress(escrow_address) for escrow_address in escrow_addresses]

    with open('data/proxy_list.txt', 'w') as outfile:
        for escrow in escrow_addresses:
            outfile.write(escrow + '\n')

if __name__ == '__main__':
    main()
