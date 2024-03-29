// SPDX-License-Identifier: AGPL-3.0-only

/*
    ConstantsHolderMock.sol - SKALE Allocator
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

pragma solidity 0.8.11;

import "../Permissions.sol";

interface IConstantsHolderMock {
    function setLaunchTimestamp(uint256 timestamp) external;
}

/**
 * @dev Interface of Delegatable Token operations.
 */
contract ConstantsHolderMock is Permissions, IConstantsHolderMock {

    uint256 public launchTimestamp;

    function setLaunchTimestamp(uint256 timestamp) external override onlyOwner {
        require(
            block.timestamp < launchTimestamp,
            "Can't set network launch timestamp because network is already launched"
        );
        launchTimestamp = timestamp;
    }

    function initialize(address contractManagerAddress) public override initializer {
        Permissions.initialize(contractManagerAddress);
    }

}