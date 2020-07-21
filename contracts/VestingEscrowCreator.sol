// SPDX-License-Identifier: AGPL-3.0-only

/*
    VestingEscrowCreator.sol - SKALE Manager
    Copyright (C) 2019-Present SKALE Labs
    @author Artem Payvin

    SKALE Manager is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    SKALE Manager is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with SKALE Manager.  If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity 0.6.10;
pragma experimental ABIEncoderV2;

// import "@openzeppelin/contracts-ethereum-package/contracts/introspection/IERC1820Registry.sol";
// import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC777/IERC777Sender.sol";
// import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC777/IERC777Recipient.sol";
// import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
// import "./interfaces/delegation/ILocker.sol";
// import "./ETOP.sol";
import "./VestingEscrow.sol";
import "./Permissions.sol";
// import "./interfaces/delegation/IDelegationController.sol";
// import "./interfaces/delegation/IDistributor.sol";
// import "./interfaces/delegation/ITokenState.sol";
// import "./interfaces/delegation/IValidatorService.sol";

contract VestingEscrowCreator is  Permissions {

    function create(address holder) external allow("ETOP") returns (address) {
        return address(new VestingEscrow(address(contractManager), holder));
    }

    function initialize(address contractManagerAddress) public override initializer {
        Permissions.initialize(contractManagerAddress);
    }

}