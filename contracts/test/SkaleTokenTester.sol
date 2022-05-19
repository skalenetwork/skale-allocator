// SPDX-License-Identifier: AGPL-3.0-only

/*
    SkaleTokenInternalTester.sol - SKALE Allocator
    Copyright (C) 2018-Present SKALE Labs
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

import "@openzeppelin/contracts-upgradeable/token/ERC777/ERC777Upgradeable.sol";

import "../Permissions.sol";
import "@skalenetwork/skale-manager-interfaces/delegation/ILocker.sol";

interface ISkaleTokenTester {
    function mint(
        address account,
        uint256 amount,
        bytes memory userData,
        bytes memory operatorData
    ) external returns(bool);
    function getAndUpdateLockedAmount(address wallet) external returns (uint);
    function getAndUpdateDelegatedAmount(address) external pure returns (uint);
    function getAndUpdateSlashedAmount(address) external pure returns (uint);
}

contract SkaleTokenTester is ERC777Upgradeable, Permissions, ISkaleTokenTester {

    uint256 public constant CAP = 7 * 1e9 * (10 ** 18); // the maximum amount of tokens that can ever be created

    // solhint-disable-next-line comprehensive-interface
    constructor(
        address contractManagerAddress,
        string memory name,
        string memory symbol,
        address[] memory defOp
    )
        public
    {
        ERC777Upgradeable.__ERC777_init(name, symbol, defOp);
        Permissions.initialize(contractManagerAddress);
    }

    function mint(
        address account,
        uint256 amount,
        bytes memory userData,
        bytes memory operatorData
    )
        external override
        onlyOwner
        returns (bool)
    {
        require(amount <= CAP - totalSupply(), "Amount is too big");
        _mint(
            account,
            amount,
            userData,
            operatorData
        );

        return true;
    }

    function getAndUpdateDelegatedAmount(address) external pure override returns (uint) {
        return 0;
    }

    function getAndUpdateSlashedAmount(address) external pure override returns (uint) {
        return 0;
    }

    function getAndUpdateLockedAmount(address wallet) public override returns (uint) {
        ILocker tokenState = ILocker(contractManager.getContract("TokenState"));
        return tokenState.getAndUpdateLockedAmount(wallet);
    }

    function _beforeTokenTransfer(
        address, // operator
        address from,
        address, // to
        uint256 tokenId)
        internal override
    {
        uint256 locked = getAndUpdateLockedAmount(from);
        if (locked > 0) {
            require(balanceOf(from) >= locked + tokenId, "Token should be unlocked for transferring");
        }
    }
}
