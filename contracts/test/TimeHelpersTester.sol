// SPDX-License-Identifier: AGPL-3.0-only

/*
    TimeHelpers.sol - SKALE Allocator
    Copyright (C) 2019-Present SKALE Labs
    @author Dmytro Stebaiev

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

import "./thirdparty/BokkyPooBahsDateTimeLibrary.sol";

interface ITimeHelpers {
    function getCurrentMonth() external view returns (uint);
    function monthToTimestamp(uint256 month) external view returns (uint256 timestamp);
    function timestampToMonth(uint256 timestamp) external pure returns (uint);
}

/**
 * @title TimeHelpers
 * @dev The contract performs time operations.
 *
 * These functions are used to calculate monthly and Proof of Use epochs.
 */
contract TimeHelpersTester is ITimeHelpers {

    uint256 constant private _ZERO_YEAR = 2020;

    function getCurrentMonth() external view override returns (uint) {
        return timestampToMonth(block.timestamp);
    }

    function monthToTimestamp(uint256 month) public view override returns (uint256 timestamp) {
        uint256 year = _ZERO_YEAR;
        uint256 _month = month;
        year = year + _month / 12;
        _month = _month % 12;
        _month = _month + 1;
        return BokkyPooBahsDateTimeLibrary.timestampFromDate(year, _month, 1);
    }

    function timestampToMonth(uint256 timestamp) public pure override returns (uint) {
        uint256 year;
        uint256 month;
        (year, month, ) = BokkyPooBahsDateTimeLibrary.timestampToDate(timestamp);
        require(year >= _ZERO_YEAR, "Timestamp is too far in the past");
        month = month - 1 + (year - _ZERO_YEAR) * 12;
        require(month > 0, "Timestamp is too far in the past");
        return month;
    }

}
