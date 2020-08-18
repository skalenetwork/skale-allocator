// SPDX-License-Identifier: AGPL-3.0-only

/*
    Escrow.sol - SKALE Allocator
    Copyright (C) 2020-Present SKALE Labs
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
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/introspection/IERC1820Registry.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC777/IERC777Sender.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC777/IERC777Recipient.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";

import "./interfaces/delegation/IDelegationController.sol";
import "./interfaces/delegation/IDistributor.sol";
import "./interfaces/delegation/ITokenState.sol";

import "./Allocator.sol";
import "./Permissions.sol";


/**
 * @title Escrow
 * @dev This contract manages funds locked by allocator.
 */
contract Escrow is IERC777Recipient, IERC777Sender, Permissions {

    address private _subject;

    uint256 private _availableAmountAfterTermination;

    IERC1820Registry private _erc1820;

    modifier onlySubject() {
        require(_msgSender() == _subject, "Message sender is not a plan subject");
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

    modifier onlySubjectAndVestingManager() {
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        require(
            (_msgSender() == _subject && allocator.isVestingActive(_subject)) ||
            allocator.hasRole(allocator.VESTING_MANAGER_ROLE(), _msgSender()),
            "Message sender is not authorized"
        );
        _;
    }   

    function initialize(address contractManagerAddress, address subject) external initializer {
        Permissions.initialize(contractManagerAddress);
        _subject = subject;
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
        require(to == _subject || to == address(_getAllocatorContract()), "Not authorized transfer");
    }

    /**
     * @dev Allosubject to retrieve vested tokens from the Escrow contract.
     * Slashed tokens are non-transferable.
     */
    function retrieve() external onlySubject {
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        ITokenState tokenState = ITokenState(contractManager.getContract("TokenState"));
        uint256 vestedAmount = 0;
        if (allocator.isVestingActive(_subject)) {
            vestedAmount = allocator.calculateVestedAmount(_subject);
        } else {
            vestedAmount = _availableAmountAfterTermination;
        }
        uint256 escrowBalance = IERC20(contractManager.getContract("SkaleToken")).balanceOf(address(this));
        uint256 fullAmount = allocator.getFullAmount(_subject);
        uint256 forbiddenToSend = tokenState.getAndUpdateForbiddenForDelegationAmount(address(this));
        if (vestedAmount > fullAmount.sub(escrowBalance)) {
            if (vestedAmount.sub(fullAmount.sub(escrowBalance)) > forbiddenToSend)
            require(
                IERC20(contractManager.getContract("SkaleToken")).transfer(
                    _subject,
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
     * after Allocatsubject termination. Slashed tokens are non-transferable.
     *
     * Requirements:
     *
     * - Allocator must be active.
     */
    function retrieveAfterTermination() external onlyVestingManager {
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        ITokenState tokenState = ITokenState(contractManager.getContract("TokenState"));

        require(!allocator.isVestingActive(_subject), "Vesting is active");
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
     * @dev Allows Allocatsubject to propose a delegation to a validator.
     *
     * Requirements:
     *
     * - Allocatsubject must be active.
     *subject has sufficient delegatable tokens.
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
        onlySubject
    {
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        require(allocator.isVestingActive(_subject), "Allocatsubject is not Active");        
        if (!allocator.isDelegationAllowed(_subject)) {
            require(allocator.calculateVestedAmount(_subject) >= amount, "Incorrect amount to delegate");
        }
        
        IDelegationController delegationController = IDelegationController(
            contractManager.getContract("DelegationController")
        );
        delegationController.delegate(validatorId, amount, delegationPeriod, info);
    }

    /**
     * @dev Allosubject and Owner to request undelegation. Only Owner can
     * request undelegation after Allocatsubject is deactivated (upsubject
     * termination).
     *
     * Requirements:
     *
     *subject or Allocator Owner must be `msg.sender`.
     * - Allocatsubject must be active whsubject is `msg.sender`.
     */
    function requestUndelegation(uint256 delegationId) external onlySubjectAndVestingManager {
        IDelegationController delegationController = IDelegationController(
            contractManager.getContract("DelegationController")
        );
        delegationController.requestUndelegation(delegationId);
    }

    /**
     * @dev Allosubject and Owner to withdraw earned bounty. Only Owner can
     * withdraw bounty to Allocator contract after Allocatsubject is deactivated.
     *
     * Withdraws are only possible after 90 day initial network lock.
     *
     * Requirements:
     *
     *subject or Allocator Owner must be `msg.sender`.
     * - Allocator must be active whsubject is `msg.sender`.
     */
    function withdrawBounty(uint256 validatorId, address to) external onlySubjectAndVestingManager {        
        IDistributor distributor = IDistributor(contractManager.getContract("Distributor"));
        if (_msgSender() == _subject) {
            Allocator allocator = Allocator(contractManager.getContract("Allocator"));
            require(allocator.isVestingActive(_subject), "Allocatsubject is not Active");            
            distributor.withdrawBounty(validatorId, to);
        } else {            
            distributor.withdrawBounty(validatorId, address(_getAllocatorContract()));
        }
    }

    /**
     * @dev Allows Allocator contract to cancel vesting of an Allocatsubject. Cancel
     * vesting is performed upon termination.
     * TODO: missing moving Allocatsubject to deactivated state?
     */
    function cancelVesting(uint256 vestedAmount) external allow("Allocator") {
        _availableAmountAfterTermination = vestedAmount;
    }

    // private

    function _getAllocatorContract() internal view returns (Allocator) {
        return Allocator(contractManager.getContract("Allocator"));
    }
}