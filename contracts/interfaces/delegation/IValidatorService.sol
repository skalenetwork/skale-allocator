// SPDX-License-Identifier: AGPL-3.0-only

/*
    IValidatorService.sol - SKALE SAFT Core
    Copyright (C) 2019-Present SKALE Labs
    @author Artem Payvin

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

/**
 * @dev Interface of Delegatable Token operations.
 */
interface IValidatorService {

    function isAuthorizedValidator(uint256 validatorId) external view returns (bool);
}