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
 * @dev This contract manages funds locked by the Allocator contract.
 */
contract Escrow is IERC777Recipient, IERC777Sender, Permissions {

    address private _beneficiary;

    uint256 private _availableAmountAfterTermination;

    IERC1820Registry private _erc1820;

    modifier onlyBeneficiary() {
        require(_msgSender() == _beneficiary, "Message sender is not a plan beneficiary");
        _;
    }

    modifier onlyVestingManager() {
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        require(
            allocator.hasRole(allocator.VESTING_MANAGER_ROLE(), _msgSender()),
            "Message sender is not a vesting manager"
        );
        _;
    }

    modifier onlyBeneficiaryAndVestingManager() {
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        require(
            (_msgSender() == _beneficiary && allocator.isVestingActive(_beneficiary)) ||
            allocator.hasRole(allocator.VESTING_MANAGER_ROLE(), _msgSender()),
            "Message sender is not authorized"
        );
        _;
    }   

    function initialize(address contractManagerAddress, address beneficiary) external initializer {
        Permissions.initialize(contractManagerAddress);
        _beneficiary = beneficiary;
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
        require(to == _beneficiary || to == address(_getAllocatorContract()), "Not authorized transfer");
    }

    /**
     * @dev Allows Beneficiary to retrieve vested tokens from the Escrow contract.
     * 
     * IMPORTANT: Slashed tokens are non-transferable.
     */
    function retrieve() external onlyBeneficiary {
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        ITokenState tokenState = ITokenState(contractManager.getContract("TokenState"));
        uint256 vestedAmount = 0;
        if (allocator.isVestingActive(_beneficiary)) {
            vestedAmount = allocator.calculateVestedAmount(_beneficiary);
        } else {
            vestedAmount = _availableAmountAfterTermination;
        }
        uint256 escrowBalance = IERC20(contractManager.getContract("SkaleToken")).balanceOf(address(this));
        uint256 fullAmount = allocator.getFullAmount(_beneficiary);
        uint256 forbiddenToSend = tokenState.getAndUpdateForbiddenForDelegationAmount(address(this));
        if (vestedAmount > fullAmount.sub(escrowBalance)) {
            if (vestedAmount.sub(fullAmount.sub(escrowBalance)) > forbiddenToSend)
            require(
                IERC20(contractManager.getContract("SkaleToken")).transfer(
                    _beneficiary,
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
     * @dev Allows Vesting Manager to retrieve remaining transferrable escrow balance
     * after beneficiary's termination. 
     * 
     * IMPORTANT: Slashed tokens are non-transferable.
     * 
     * Requirements:
     * 
     * - Allocator must be active.
     */
    function retrieveAfterTermination() external onlyVestingManager {
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        ITokenState tokenState = ITokenState(contractManager.getContract("TokenState"));

        require(!allocator.isVestingActive(_beneficiary), "Vesting is active");
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
     * @dev Allows Beneficiary to propose a delegation to a validator.
     * 
     * Requirements:
     * 
     * - Beneficiary must be active.
     * - Beneficiary must have sufficient delegatable tokens.
     * - If trusted list is enabled, validator must be a member of the trusted
     * list.
     */
    function delegate(
        uint256 validatorId,
        uint256 amount,
        uint256 delegationPeriod,
        string calldata info
    )
        external
        onlyBeneficiary
    {
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        require(allocator.isVestingActive(_beneficiary), "Beneficiary is not Active");        
        if (!allocator.isDelegationAllowed(_beneficiary)) {
            require(allocator.calculateVestedAmount(_beneficiary) >= amount, "Incorrect amount to delegate");
        }
        
        IDelegationController delegationController = IDelegationController(
            contractManager.getContract("DelegationController")
        );
        delegationController.delegate(validatorId, amount, delegationPeriod, info);
    }

    /**
     * @dev Allows Beneficiary and Vesting Owner to request undelegation. Only 
     * Vesting Owner can request undelegation after beneficiary is deactivated 
     * (after beneficiary termination).
     * 
     * Requirements:
     * 
     * - Beneficiary and Vesting Owner must be `msg.sender`.
     */
    function requestUndelegation(uint256 delegationId) external onlyBeneficiaryAndVestingManager {
        IDelegationController delegationController = IDelegationController(
            contractManager.getContract("DelegationController")
        );
        delegationController.requestUndelegation(delegationId);
    }

    /**
     * @dev Allows Beneficiary and Vesting Owner to withdraw earned bounty. Only
     * Vesting Owner can withdraw bounty to Allocator contract after beneficiary
     * is deactivated.
     * 
     * IMPORTANT: Withdraws are only possible after 90 day initial network lock.
     * 
     * Requirements:
     * 
     * - Beneficiary or Vesting Owner must be `msg.sender`.
     * - Beneficiary must be active when Beneficiary is `msg.sender`.
     */
    function withdrawBounty(uint256 validatorId, address to) external onlyBeneficiaryAndVestingManager {        
        IDistributor distributor = IDistributor(contractManager.getContract("Distributor"));
        if (_msgSender() == _beneficiary) {
            Allocator allocator = Allocator(contractManager.getContract("Allocator"));
            require(allocator.isVestingActive(_beneficiary), "Beneficiary is not Active");            
            distributor.withdrawBounty(validatorId, to);
        } else {            
            distributor.withdrawBounty(validatorId, address(_getAllocatorContract()));
        }
    }

    /**
     * @dev Allows Allocator contract to cancel vesting of a Beneficiary. Cancel
     * vesting is performed upon termination.
     * 
     * TODO: missing moving beneficiary to deactivated state?
     */
    function cancelVesting(uint256 vestedAmount) external allow("Allocator") {
        _availableAmountAfterTermination = vestedAmount;
    }

    // private

    function _getAllocatorContract() internal view returns (Allocator) {
        return Allocator(contractManager.getContract("Allocator"));
    }
}
