// SPDX-License-Identifier: AGPL-3.0-only

/*
    ITokenLaunchManager.sol - SKALE Allocator
    Copyright (C) 2019-Present SKALE Labs
    @author Artem Payvin

    SKALE Allocator is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    SKALE Allocator is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with SKALE Allocator.  If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity 0.6.10;

// import "@openzeppelin/contracts-ethereum-package/contracts/access/AccessControl.sol";

import "../Permissions.sol";


/**
 * @dev Interface of Delegatable Token operations.
 */
contract TokenLaunchManagerTester is Permissions {

    bytes32 public constant SELLER_ROLE = keccak256("SELLER_ROLE");

    function initialize(address contractManagerAddress) public override initializer {
        Permissions.initialize(contractManagerAddress);
    }
}