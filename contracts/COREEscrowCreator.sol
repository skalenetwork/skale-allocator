// SPDX-License-Identifier: AGPL-3.0-only

/*
    COREEscrowCreator.sol - SKALE SAFT CORE
    Copyright (C) 2020-Present SKALE Labs
    @author Artem Payvin

    SKALE SAFT CORE is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    SKALE SAFT CORE is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with SKALE SAFT CORE.  If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity 0.6.10;
pragma experimental ABIEncoderV2;

// import "@openzeppelin/contracts-ethereum-package/contracts/introspection/IERC1820Registry.sol";
// import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC777/IERC777Sender.sol";
// import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC777/IERC777Recipient.sol";
// import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
// import "./interfaces/delegation/ILocker.sol";
// import "./CORE.sol";
import "./COREEscrow.sol";
import "./Permissions.sol";
// import "./interfaces/delegation/IDelegationController.sol";
// import "./interfaces/delegation/IDistributor.sol";
// import "./interfaces/delegation/ITokenState.sol";
// import "./interfaces/delegation/IValidatorService.sol";

/**
 * @title CORE Escrow Creator
 * @dev This contract allows the creation of individual CORE escrow contracts.
 */
contract COREEscrowCreator is Permissions {

    function create(address holder) external allow("CORE") returns (address) {
        return address(new COREEscrow(address(contractManager), holder));
    }

    function initialize(address contractManagerAddress) public override initializer {
        Permissions.initialize(contractManagerAddress);
    }

}