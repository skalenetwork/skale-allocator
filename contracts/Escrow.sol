// SPDX-License-Identifier: AGPL-3.0-only

/*
    Escrow.sol - SKALE Allocator
    Copyright (C) 2020-Present SKALE Labs
    @author Artem Payvin
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

pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    IERC777Recipient
} from "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";
import {
    IERC777Sender
} from "@openzeppelin/contracts/token/ERC777/IERC777Sender.sol";
import {
    IERC1820Registry
} from "@openzeppelin/contracts/utils/introspection/IERC1820Registry.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {
    IDelegationController
} from "@skalenetwork/skale-manager-interfaces/delegation/IDelegationController.sol";
import {
    IDistributor
} from "@skalenetwork/skale-manager-interfaces/delegation/IDistributor.sol";
import {
    ILocker
} from "@skalenetwork/skale-manager-interfaces/delegation/ILocker.sol";

import {Allocator} from "./Allocator.sol";
import {IEscrow} from "./interfaces/IEscrow.sol";
import {Permissions} from "./Permissions.sol";

/**
 * @title Escrow
 * @dev This contract manages funds locked by the Allocator contract.
 */
contract Escrow is IERC777Recipient, IERC777Sender, IEscrow, Permissions {
    bytes32 public constant BENEFICIARY_ROLE = keccak256("BENEFICIARY_ROLE");

    address internal _beneficiary;

    uint256 private _availableAmountAfterTermination;

    IERC1820Registry private _erc1820;


    event BeneficiaryUpdated(
        address indexed oldValue,
        address indexed newValue
    );

    event VestingCanceled(uint256 indexed vestedAmount);

    error CallerNotBeneficiary();
    error CallerNotVestingManager();
    error CallerNotAuthorized();
    error BeneficiaryAddressNotSet();
    error BeneficiaryAddressZero();
    error TokenTransferFailed();
    error DestinationAddressNotSet();
    error VestingIsActive();
    error DelegationNotAllowed();
    error BeneficiaryNotActive();

    modifier onlyBeneficiary() virtual {
        require(
            _msgSender() == _beneficiary ||
                hasRole(BENEFICIARY_ROLE, _msgSender()),
            CallerNotBeneficiary()
        );
        _;
    }

    modifier onlyVestingManager() {
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        require(
            allocator.hasRole(allocator.VESTING_MANAGER_ROLE(), _msgSender()),
            CallerNotVestingManager()
        );
        _;
    }

    modifier onlyActiveBeneficiaryOrVestingManager() virtual {
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        if (allocator.isVestingActive(_beneficiary)) {
            require(
                _msgSender() == _beneficiary || hasRole(BENEFICIARY_ROLE, _msgSender()),
                CallerNotBeneficiary()
            );
        } else {
            require(
                allocator.hasRole(allocator.VESTING_MANAGER_ROLE(), _msgSender()),
                CallerNotAuthorized()
            );
        }
        _;
    }

    function initialize(address contractManagerAddress, address beneficiary) external override initializer {
        require(beneficiary != address(0), BeneficiaryAddressZero());
        Permissions.initialize(contractManagerAddress);
        emit BeneficiaryUpdated(_beneficiary, beneficiary);
        _beneficiary = beneficiary;
        _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
        _erc1820.setInterfaceImplementer(address(this), keccak256("ERC777TokensRecipient"), address(this));
        _erc1820.setInterfaceImplementer(address(this), keccak256("ERC777TokensSender"), address(this));
    }

    function changeBeneficiaryAddress(address beneficiary) external override allow("Allocator") {
        require(beneficiary != address(0), BeneficiaryAddressZero());
        emit BeneficiaryUpdated(_beneficiary, beneficiary);
        _beneficiary = beneficiary;
    }

    function tokensReceived(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes calldata userData,
        bytes calldata operatorData
    )
        external
        override
        allow("SkaleToken")
    // solhint-disable-next-line no-empty-blocks
    {}


    function tokensToSend(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes calldata userData,
        bytes calldata operatorData
    )
        external
        override
        allow("SkaleToken")
    // solhint-disable-next-line no-empty-blocks
    {}

    /**
     * @dev Allows Beneficiary to retrieve vested tokens from the Escrow contract.
     *
     * IMPORTANT: Slashed tokens are non-transferable.
     */
    function retrieve() external override onlyBeneficiary {
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        ILocker tokenState = ILocker(contractManager.getContract("TokenState"));
        uint256 vestedAmount = 0;
        if (allocator.isVestingActive(_beneficiary)) {
            vestedAmount = allocator.calculateVestedAmount(_beneficiary);
        } else {
            vestedAmount = _availableAmountAfterTermination;
        }
        uint256 escrowBalance = IERC20(contractManager.getContract("SkaleToken")).balanceOf(address(this));
        uint256 locked = Math.max(
            allocator.getFullAmount(_beneficiary) - vestedAmount,
            tokenState.getAndUpdateForbiddenForDelegationAmount(address(this))
        );
        if (escrowBalance > locked) {
            require(
                IERC20(contractManager.getContract("SkaleToken")).transfer(
                    _beneficiary,
                    escrowBalance - locked
                ),
                TokenTransferFailed()
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
    function retrieveAfterTermination(address destination) external override onlyVestingManager {
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        ILocker tokenState = ILocker(contractManager.getContract("TokenState"));

        require(destination != address(0), DestinationAddressNotSet());
        require(!allocator.isVestingActive(_beneficiary), VestingIsActive());
        uint256 escrowBalance = IERC20(contractManager.getContract("SkaleToken")).balanceOf(address(this));
        uint256 forbiddenToSend = tokenState.getAndUpdateLockedAmount(address(this));
        if (escrowBalance > forbiddenToSend) {
            require(
                IERC20(contractManager.getContract("SkaleToken")).transfer(
                    destination,
                    escrowBalance - forbiddenToSend
                ),
                TokenTransferFailed()
            );
        }
    }

    /**
     * @dev Allows Beneficiary to propose a delegation to a validator.
     *
     * Requirements:
     *
     * - Beneficiary must be active.
     * - Beneficiary must have sufficient delegable tokens.
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
        override
        onlyBeneficiary
    {
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        require(
            allocator.isDelegationAllowed(_beneficiary),
            DelegationNotAllowed()
        );
        require(
            allocator.isVestingActive(_beneficiary),
            BeneficiaryNotActive()
        );

        IDelegationController delegationController = IDelegationController(
            contractManager.getContract("DelegationController")
        );
        delegationController.delegate(
            validatorId,
            amount,
            delegationPeriod,
            info
        );
    }

    /**
     * @dev Allows Beneficiary and Vesting manager to request undelegation. Only
     * Vesting manager can request undelegation after beneficiary is deactivated
     * (after beneficiary termination).
     *
     * Requirements:
     *
     * - Beneficiary and Vesting manager must be `msg.sender`.
     */
    function requestUndelegation(uint256 delegationId)
        external
        override
        onlyActiveBeneficiaryOrVestingManager
    {
        IDelegationController delegationController = IDelegationController(
            contractManager.getContract("DelegationController")
        );
        delegationController.requestUndelegation(delegationId);
    }

    /**
     * @dev Allows Beneficiary and Vesting manager to cancel a delegation proposal. Only
     * Vesting manager can request undelegation after beneficiary is deactivated
     * (after beneficiary termination).
     *
     * Requirements:
     *
     * - Beneficiary and Vesting manager must be `msg.sender`.
     */
    function cancelPendingDelegation(
        uint256 delegationId
    )
        external
        override
        onlyActiveBeneficiaryOrVestingManager
    {
        IDelegationController delegationController = IDelegationController(
            contractManager.getContract("DelegationController")
        );
        delegationController.cancelPendingDelegation(delegationId);
    }

    /**
     * @dev Allows Beneficiary and Vesting manager to withdraw earned bounty. Only
     * Vesting manager can withdraw bounty to Allocator contract after beneficiary
     * is deactivated.
     *
     * IMPORTANT: Withdraws are only possible after 90 day initial network lock.
     *
     * Requirements:
     *
     * - Beneficiary or Vesting manager must be `msg.sender`.
     * - Beneficiary must be active when Beneficiary is `msg.sender`.
     */
    function withdrawBounty(
        uint256 validatorId,
        address to
    )
        external
        override
        onlyActiveBeneficiaryOrVestingManager
    {
        IDistributor distributor = IDistributor(contractManager.getContract("Distributor"));
        distributor.withdrawBounty(validatorId, to);
    }

    /**
     * @dev Allows Allocator contract to cancel vesting of a Beneficiary. Cancel
     * vesting is performed upon termination.
     */
    function cancelVesting(uint256 vestedAmount) external override allow("Allocator") {
        emit VestingCanceled(vestedAmount);
        _availableAmountAfterTermination = vestedAmount;
    }
}
