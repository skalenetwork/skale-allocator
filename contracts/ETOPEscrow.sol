// SPDX-License-Identifier: AGPL-3.0-only

/*
    ETOPEscrow.sol - SKALE SAFT ETOP
    Copyright (C) 2020-Present SKALE Labs
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

import "@openzeppelin/contracts-ethereum-package/contracts/introspection/IERC1820Registry.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC777/IERC777Sender.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC777/IERC777Recipient.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "./interfaces/delegation/ILocker.sol";
import "./ETOP.sol";
import "./Permissions.sol";
import "./interfaces/delegation/IDelegationController.sol";
import "./interfaces/delegation/IDistributor.sol";
import "./interfaces/delegation/ITokenState.sol";
import "./interfaces/delegation/IValidatorService.sol";

/**
 * @title ETOP Escrow
 * @dev This contract manages ETOP escrow operations for the SKALE Employee
 * Token Open Plan.
 */
contract ETOPEscrow is IERC777Recipient, IERC777Sender, Permissions {

    address private _holder;

    address private _etopContract;

    uint private _availableAmountAfterTermination;

    IERC1820Registry private _erc1820;

    modifier onlyHolder() {
        require(_msgSender() == _holder, "Message sender is not a holder");
        _;
    }

    modifier onlyHolderAndOwner() {
        ETOP etop = ETOP(contractManager.getContract("ETOP"));
        require(
            _msgSender() == _holder && etop.isActiveVestingTerm(_holder) || _msgSender() == etop.vestingManager(),
            "Message sender is not authorized"
        );
        _;
    }

    constructor(address contractManagerAddress, address newHolder) public {
        Permissions.initialize(contractManagerAddress);
        _etopContract = msg.sender;
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
        require(to == _holder || hasRole(DEFAULT_ADMIN_ROLE, to), "Not authorized transfer");
    }

    /**
     * @dev Allows Holder to retrieve locked tokens from SKALE Token to the ETOP
     * Escrow contract.
     */
    function retrieve() external onlyHolder {
        ETOP etop = ETOP(contractManager.getContract("ETOP"));
        ITokenState tokenState = ITokenState(contractManager.getContract("TokenState"));
        // require(etop.isActiveVestingTerm(_holder), "ETOP term is not Active");
        uint vestedAmount = 0;
        if (etop.isActiveVestingTerm(_holder)) {
            vestedAmount = etop.calculateVestedAmount(_holder);
        } else {
            vestedAmount = _availableAmountAfterTermination;
        }
        uint escrowBalance = IERC20(contractManager.getContract("SkaleToken")).balanceOf(address(this));
        uint fullAmount = etop.getFullAmount(_holder);
        uint forbiddenToSend = tokenState.getAndUpdateForbiddenForDelegationAmount(address(this));
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
     * @dev Allows ETOP Owner to retrieve remaining transferrable escrow balance
     * after ETOP holder termination. Slashed tokens are non-transferable.
     *
     * Requirements:
     *
     * - ETOP must be active.
     */
    function retrieveAfterTermination() external onlyOwner {
        ETOP etop = ETOP(contractManager.getContract("ETOP"));
        ITokenState tokenState = ITokenState(contractManager.getContract("TokenState"));

        require(!etop.isActiveVestingTerm(_holder), "ETOP holder is not Active");
        uint escrowBalance = IERC20(contractManager.getContract("SkaleToken")).balanceOf(address(this));
        uint forbiddenToSend = tokenState.getAndUpdateLockedAmount(address(this));
        if (escrowBalance > forbiddenToSend) {
            require(
                IERC20(contractManager.getContract("SkaleToken")).transfer(
                    _etopContract,
                    escrowBalance.sub(forbiddenToSend)
                ),
                "Error of token send"
            );
        }
    }

    /**
     * @dev Allows ETOP holder to propose a delegation to a validator.
     *
     * Requirements:
     *
     * - ETOP holder must be active.
     * - Holder has sufficient delegatable tokens.
     * - If trusted list is enabled, validator must be a member of this trusted
     * list.
     */
    function delegate(
        uint validatorId,
        uint amount,
        uint delegationPeriod,
        string calldata info
    )
        external
        onlyHolder
    {
        ETOP etop = ETOP(contractManager.getContract("ETOP"));
        require(etop.isActiveVestingTerm(_holder), "ETOP holder is not Active");        
        if (!etop.isUnvestedDelegatableTerm(_holder)) {
            require(etop.calculateVestedAmount(_holder) >= amount, "Incorrect amount to delegate");
        }
        
        IDelegationController delegationController = IDelegationController(
            contractManager.getContract("DelegationController")
        );
        delegationController.delegate(validatorId, amount, delegationPeriod, info);
    }

    /**
     * @dev Allows Holder and Owner to request undelegation. Only Owner can
     * request undelegation after ETOP holder is deactivated (upon holder
     * termination).
     *
     * Requirements:
     *
     * - Holder or ETOP Owner must be `msg.sender`.
     * - ETOP holder must be active when Holder is `msg.sender`.
     */
    function requestUndelegation(uint delegationId) external onlyHolderAndOwner {
        ETOP etop = ETOP(contractManager.getContract("ETOP"));
        require(
            _msgSender() == _holder && etop.isActiveVestingTerm(_holder) || _msgSender() == etop.vestingManager(),
            "Message sender is not authorized"
        );
        if (_msgSender() == _holder) {
            require(etop.isActiveVestingTerm(_holder), "ETOP holder is not Active");
        }
        IDelegationController delegationController = IDelegationController(
            contractManager.getContract("DelegationController")
        );
        delegationController.requestUndelegation(delegationId);
    }

    /**
     * @dev Allows Holder and Owner to withdraw earned bounty. Only Owner can
     * withdraw bounty to ETOP contract after ETOP holder is deactivated.
     *
     * Requirements:
     *
     * - Holder or ETOP Owner must be `msg.sender`.
     * - ETOP must be active when Holder is `msg.sender`.
     */
    function withdrawBounty(uint validatorId, address to) external onlyHolderAndOwner {
        IDistributor distributor = IDistributor(contractManager.getContract("Distributor"));
        if (_msgSender() == _holder) {
            ETOP etop = ETOP(contractManager.getContract("ETOP"));
            require(etop.isActiveVestingTerm(_holder), "ETOP holder is not Active");
            distributor.withdrawBounty(validatorId, to);
        } else {
            distributor.withdrawBounty(validatorId, _etopContract);
        }
    }

    /**
     * @dev Allows ETOP contract to cancel vesting of an ETOP holder. Cancel
     * vesting is performed upon termination.
     * TODO: missing moving ETOP holder to deactivated state?
     */
    function cancelVesting(uint vestedAmount) external allow("ETOP") {
        _availableAmountAfterTermination = vestedAmount;
    }
}