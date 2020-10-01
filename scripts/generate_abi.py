#!/usr/bin/env python

import json
import sys
import re


def camel_to_snake(name):
    # name = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    # return re.sub('([a-z0-9])([A-Z])', r'\1_\2', name).lower()
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()


def main():
    if len(sys.argv) < 3:
        print('Usage:')
        print('./generate_abi.py {network file} {build dir} {skale-manager abi}')
        print('Example:')
        print('./generate_abi.py ../.openzeppelin/mainnet.json ../build ./skale-manager-1.5.2-mainnet-abi.json')
        exit(1)

    try:
        with open(sys.argv[1]) as json_file:
            network_file = json.loads(json_file.read())
        with open(sys.argv[3]) as json_file:
            manager_file = json.loads(json_file.read())
    except Exception as e:
        print(e)
        exit(2)

    result = {}
    for alias in network_file['proxies'].keys():
        name = alias.split('/')[-1]
        address = network_file['proxies'][alias][0]['address']
        try:
            artifact_filename = sys.argv[2] + '/contracts/' + name + '.json'
            with open(artifact_filename) as artifact_file:
                artifact = json.loads(artifact_file.read())
                abi = artifact['abi']
        except Exception as e:
            print('Error on processing of ' + artifact_file)
            print(e)
            exit(3)
        snake_name = camel_to_snake(name)
        result[snake_name + '_address'] = address
        result[snake_name + '_abi'] = abi
    result['proxy_factory_address'] = network_file['proxyFactory']['address']
    result['proxy_admin_address'] = network_file['proxyAdmin']['address']
    result['contract_manager_abi'] = manager_file['contract_manager_abi']
    result['contract_manager_address'] = manager_file['contract_manager_address']

    print(json.dumps(result, sort_keys=True, indent=4))


if __name__ == '__main__':
    main()
