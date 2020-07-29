// SPDX-License-Identifier: AGPL-3.0-only

/*
    ProxyFactoryMock.sol - SKALE SAFT Core
    Copyright (C) 2018-Present SKALE Labs
    @author Dmytro Stebaiev

    SKALE SAFT Core is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    SKALE SAFT Core is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with SKALE SAFT Core.  If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity 0.6.10;

import "../interfaces/openzeppelin/IProxyFactory.sol";


contract ProxyMock {
    address public target;

    constructor(address _implementation, bytes memory _data) public {
        target = _implementation;
        if(_data.length > 0) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success,) = _implementation.delegatecall(_data);
            require(success);
        }
    }

    fallback () payable external {
        _delegate(target);
    }

    function _delegate(address implementation) internal {
        // solhint-disable-next-line no-inline-assembly
        assembly {
        // Copy msg.data. We take full control of memory in this inline assembly
        // block because it will not return to Solidity code. We overwrite the
        // Solidity scratch pad at memory position 0.
        calldatacopy(0, 0, calldatasize())

        // Call the implementation.
        // out and outsize are 0 because we don't know the size yet.
        let result := delegatecall(gas(), implementation, 0, calldatasize(), 0, 0)

        // Copy the returned data.
        returndatacopy(0, 0, returndatasize())

        switch result
        // delegatecall returns 0 on error.
        case 0 { revert(0, returndatasize()) }
        default { return(0, returndatasize()) }
        }
    }
}

contract ProxyFactoryMock is IProxyFactory {
    function deploy(uint256, address _logic, address, bytes memory _data) external override returns (address) {
        return address(new ProxyMock(_logic, _data));
    }
}