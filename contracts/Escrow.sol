// SPDX-License-Identifier: AGPL-3.0-only

/*
    Escrow.sol - SKALE SAFT Allocator
    Copyright (C) 2020-Present SKALE Labs
    @author Artem Payvin

    SKALE SAFT Allocator is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    SKALE SAFT Allocator is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with SKALE SAFT Allocator.  If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity 0.6.10;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/introspection/IERC1820Registry.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC777/IERC777Sender.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC777/IERC777Recipient.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "./interfaces/delegation/ILocker.sol";
import "./Allocator.sol";
import "./Permissions.sol";
import "./interfaces/delegation/IDelegationController.sol";
import "./interfaces/delegation/IDistributor.sol";
import "./interfaces/delegation/ITokenState.sol";
import "./interfaces/delegation/IValidatorService.sol";

/**
 * @title Escrow
 * @dev This contract manages funds locked by allocator.
 */
contract Escrow is IERC777Recipient, IERC777Sender, Permissions {

    address private _holder;

    uint256 private _availableAmountAfterTermination;

    IERC1820Registry private _erc1820;

    modifier onlyHolder() {
        require(_msgSender() == _holder, "Message sender is not a holder");
        _;
    }

    modifier onlyVestingManager() {
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        require(
            allocator.hasRole(allocator.VESTING_MANAGER_ROLE(), _msgSender()),
            "Message sender is not a vestring manager"
        );
        _;
    }

    modifier onlyHolderAndVestingManager() {
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        require(
            (_msgSender() == _holder && allocator.isVestingActive(_holder)) ||
            allocator.hasRole(allocator.VESTING_MANAGER_ROLE(), _msgSender()),
            "Message sender is not authorized"
        );
        _;
    }   

    function initialize(address contractManagerAddress, address newHolder) external initializer {
        Permissions.initialize(contractManagerAddress);
        _holder = newHolder;
        _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
        _erc1820.setInterfaceImplementer(address(this), keccak256("ERC777TokensRecipient"), address(this));
        _erc1820.setInterfaceImplementer(address(this), keccak256("ERC777TokensSender"), address(this));
    } 

    function tokensReceived(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes calldata userData,
        bytes calldata operatorData
    )
        external override
        allow("SkaleToken")
        // solhint-disable-next-line no-empty-blocks
    {

    }

    function tokensToSend(
        address,
        address,
        address to,
        uint256,
        bytes calldata,
        bytes calldata
    )
        external override
        allow("SkaleToken")
    {
        require(to == _holder || to == address(_getAllocatorContract()), "Not authorized transfer");
    }

    /**
     * @dev Allows Holder to retrieve vested tokens from the Escrow contract.
     * Slashed tokens are non-transferable.
     */
    function retrieve() external onlyHolder {
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        ITokenState tokenState = ITokenState(contractManager.getContract("TokenState"));
        uint256 vestedAmount = 0;
        if (allocator.isVestingActive(_holder)) {
            vestedAmount = allocator.calculateVestedAmount(_holder);
        } else {
            vestedAmount = _availableAmountAfterTermination;
        }
        uint256 escrowBalance = IERC20(contractManager.getContract("SkaleToken")).balanceOf(address(this));
        uint256 fullAmount = allocator.getFullAmount(_holder);
        uint256 forbiddenToSend = tokenState.getAndUpdateForbiddenForDelegationAmount(address(this));
        if (vestedAmount > fullAmount.sub(escrowBalance)) {
            if (vestedAmount.sub(fullAmount.sub(escrowBalance)) > forbiddenToSend)
            require(
                IERC20(contractManager.getContract("SkaleToken")).transfer(
                    _holder,
                    vestedAmount
                        .sub(
                            fullAmount
                                .sub(escrowBalance)
                            )
                        .sub(forbiddenToSend)
                ),
                "Error of token send"
            );
        }
    }

    /**
     * @dev Allows Allocator Owner to retrieve remaining transferrable escrow balance
     * after Allocator holder termination. Slashed tokens are non-transferable.
     *
     * Requirements:
     *
     * - Allocator must be active.
     */
    function retrieveAfterTermination() external onlyVestingManager {
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        ITokenState tokenState = ITokenState(contractManager.getContract("TokenState"));

        require(!allocator.isVestingActive(_holder), "Vesting is active");
        uint256 escrowBalance = IERC20(contractManager.getContract("SkaleToken")).balanceOf(address(this));
        uint256 forbiddenToSend = tokenState.getAndUpdateLockedAmount(address(this));
        if (escrowBalance > forbiddenToSend) {
            require(
                IERC20(contractManager.getContract("SkaleToken")).transfer(
                    address(_getAllocatorContract()),
                    escrowBalance.sub(forbiddenToSend)
                ),
                "Error of token send"
            );
        }
    }

    /**
     * @dev Allows Allocator holder to propose a delegation to a validator.
     *
     * Requirements:
     *
     * - Allocator holder must be active.
     * - Holder has sufficient delegatable tokens.
     * - If trusted list is enabled, validator must be a member of this trusted
     * list.
     */
    function delegate(
        uint256 validatorId,
        uint256 amount,
        uint256 delegationPeriod,
        string calldata info
    )
        external
        onlyHolder
    {
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        require(allocator.isVestingActive(_holder), "Allocator holder is not Active");        
        if (!allocator.isDelegationAllowed(_holder)) {
            require(allocator.calculateVestedAmount(_holder) >= amount, "Incorrect amount to delegate");
        }
        
        IDelegationController delegationController = IDelegationController(
            contractManager.getContract("DelegationController")
        );
        delegationController.delegate(validatorId, amount, delegationPeriod, info);
    }

    /**
     * @dev Allows Holder and Owner to request undelegation. Only Owner can
     * request undelegation after Allocator holder is deactivated (upon holder
     * termination).
     *
     * Requirements:
     *
     * - Holder or Allocator Owner must be `msg.sender`.
     * - Allocator holder must be active when Holder is `msg.sender`.
     */
    function requestUndelegation(uint256 delegationId) external onlyHolderAndVestingManager {
        IDelegationController delegationController = IDelegationController(
            contractManager.getContract("DelegationController")
        );
        delegationController.requestUndelegation(delegationId);
    }

    /**
     * @dev Allows Holder and Owner to withdraw earned bounty. Only Owner can
     * withdraw bounty to Allocator contract after Allocator holder is deactivated.
     *
     * Withdraws are only possible after 90 day initial network lock.
     *
     * Requirements:
     *
     * - Holder or Allocator Owner must be `msg.sender`.
     * - Allocator must be active when Holder is `msg.sender`.
     */
    function withdrawBounty(uint256 validatorId, address to) external onlyHolderAndVestingManager {        
        IDistributor distributor = IDistributor(contractManager.getContract("Distributor"));
        if (_msgSender() == _holder) {
            Allocator allocator = Allocator(contractManager.getContract("Allocator"));
            require(allocator.isVestingActive(_holder), "Allocator holder is not Active");            
            distributor.withdrawBounty(validatorId, to);
        } else {            
            distributor.withdrawBounty(validatorId, address(_getAllocatorContract()));
        }
    }

    /**
     * @dev Allows Allocator contract to cancel vesting of an Allocator holder. Cancel
     * vesting is performed upon termination.
     * TODO: missing moving Allocator holder to deactivated state?
     */
    function cancelVesting(uint256 vestedAmount) external allow("Allocator") {
        _availableAmountAfterTermination = vestedAmount;
    }

    // private

    function _getAllocatorContract() internal view returns (Allocator) {
        return Allocator(contractManager.getContract("Allocator"));
    }
}