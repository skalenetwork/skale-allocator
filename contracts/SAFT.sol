/*
    Vesting.sol - SKALE SAFT ETOP
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
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC777/IERC777Recipient.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "./interfaces/delegation/ILocker.sol";
import "./interfaces/ITimeHelpers.sol";
import "./VestingEscrow.sol";

/**
 * @title SAFT
 * @dev This contract manages SKALE investor tokens based on the Simple
 * Agreement for Future Tokens (SAFT).
 *
 * The process to onboard investors is as follows:
 *
 * 1- SAFT investors are registered by SKALE.
 * 2- SAFT investors approve their address.
 * 3- SKALE then activates each investor.
 */
contract SAFT is ILocker, Permissions, IERC777Recipient {

    enum TimeLine {DAY, MONTH, YEAR}

    struct SAFTRound {
        uint fullPeriod;
        uint lockupPeriod; // months
        TimeLine vestingPeriod;
        uint regularPaymentTime; // amount of days/months/years
    }

    struct SaftHolder {
        bool registered;
        bool approved;
        bool active;
        uint saftRoundId;
        uint startVestingTime;
        uint fullAmount;
        uint afterLockupAmount;
    }

    IERC1820Registry private _erc1820;

    // array of SAFT configs
    SAFTRound[] private _saftRounds;
    // SAFTRound[] private _otherPlans;

    //        holder => SAFT holder params
    mapping (address => SaftHolder) private _vestingHolders;

    //        holder => address of vesting escrow
    mapping (address => address) private _holderToEscrow;

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

    /**
     * @dev Allows `msg.sender` to approve their address as a SAFT investor.
     *
     * Requirements:
     *
     * - Investor address must be already registered.
     * - Investor address must not already be approved.
     */
    function approveSAFTHolder() external {
        address holder = msg.sender;
        require(_vestingHolders[holder].registered, "SAFT is not registered");
        require(!_vestingHolders[holder].approved, "SAFT is already approved");
        _vestingHolders[holder].approved = true;
    }

    /**
     * @dev Allows Owner to activate an investor address and transfers locked tokens
     * to investor address.
     *
     * Requirements:
     *
     * - Investor address must be already registered.
     * - Investor address must be approved.
     */
    function startVesting(address holder) external onlyOwner {
        require(_vestingHolders[holder].registered, "SAFT is not registered");
        require(_vestingHolders[holder].approved, "SAFT is not approved");
        _vestingHolders[holder].active = true;
        require(
            IERC20(contractManager.getContract("SkaleToken")).transfer(
                _holderToEscrow[holder],
                _vestingHolders[holder].fullAmount
            ),
            "Error of token sending"
        );
    }

    /**
     * @dev Allows Owner to define and add a SAFT round.
     *
     * Requirements:
     *
     * - Lockup period must be less than or equal to the full period.
     * - Locked period must be in days, months, or years.
     * - Unlock schedule must follow unlocking period TODO: clarify
     */
    function addSAFTRound(
        uint lockupPeriod, // months
        uint fullPeriod, // months
        uint8 vestingPeriod, // 1 - day 2 - month 3 - year
        uint vestingTimes // months or days or years
    )
        external
        onlyOwner
    {
        require(fullPeriod >= lockupPeriod, "Incorrect periods");
        require(vestingPeriod >= 1 && vestingPeriod <= 3, "Incorrect vesting period");
        require(
            (fullPeriod - lockupPeriod) == vestingTimes ||
            ((fullPeriod - lockupPeriod) / vestingTimes) * vestingTimes == fullPeriod - lockupPeriod,
            "Incorrect vesting times"
        );
        _saftRounds.push(SAFTRound({
            fullPeriod: fullPeriod,
            lockupPeriod: lockupPeriod,
            vestingPeriod: TimeLine(vestingPeriod - 1),
            regularPaymentTime: vestingTimes
        }));
    }

    /**
     * @dev Allows Owner and Activate to register an investor into a SAFT round.
     *
     * Requirements:
     *
     * - SAFT round must already exist.
     * - The lockup amount must be less than or equal to the full allocation.
     * - The start date for unlocking must not have already passed. TODO: to be changed
     * - The investor address must not already be included in this SAFT round.
     */
    function connectInvestorToSAFT( TODO: update naming
        address holder,
        uint saftRoundId,
        uint startVestingTime, //timestamp
        uint fullAmount,
        uint lockupAmount,
        bool connectHolderToEscrow
    )
        external
        onlyOwner
    {
        require(_saftRounds.length >= saftRoundId, "SAFT round does not exist");
        require(fullAmount >= lockupAmount, "Incorrect amounts");
        require(startVestingTime <= now, "Incorrect period starts");
        require(!_vestingHolders[holder].registered, "SAFT holder is already added");
        _vestingHolders[holder] = SaftHolder({
            registered: true,
            approved: false,
            active: false,
            saftRoundId: saftRoundId,
            startVestingTime: startVestingTime,
            fullAmount: fullAmount,
            afterLockupAmount: lockupAmount
        });
        if (connectHolderToEscrow) {
            _holderToEscrow[holder] = address(new VestingEscrow(address(contractManager), holder));
        } else {
            _holderToEscrow[holder] = holder;
        }
    }

    /**
     * @dev Updates and returns the current locked amount of tokens.
     */
    function getAndUpdateLockedAmount(address wallet) external override returns (uint) {
        if (! _vestingHolders[wallet].active) {
            return 0;
        }
        return getLockedAmount(wallet);
    }

    /**
     * @dev Updates and returns the slashed amount of tokens.
     */
    function getAndUpdateForbiddenForDelegationAmount(address) external override returns (uint) {
        // network_launch_timestamp
        return 0;
    }

    /**
     * @dev Returns the start time of SAFT.  TODO clarify language
     */
    function getStartVestingTime(address holder) external view returns (uint) {
        return _vestingHolders[holder].startVestingTime;
    }

    /**
     * @dev Returns the time of final unlock.
     */
    function getFinishVestingTime(address holder) external view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        SaftHolder memory saftHolder = _vestingHolders[holder];
        SAFTRound memory saftParams = _saftRounds[saftHolder.saftRoundId - 1];
        return timeHelpers.addMonths(saftHolder.startVestingTime, saftParams.fullPeriod);
    }

    /**
     * @dev Returns the lockup period in months.
     */
    function getLockupPeriodInMonth(address holder) external view returns (uint) {
        return _saftRounds[_vestingHolders[holder].saftRoundId - 1].lockupPeriod;
    }

    /**
     * @dev Confirms whether the investor is in an active state.
     */
    function isActiveVestingTerm(address holder) external view returns (bool) {
        return _vestingHolders[holder].active;
    }

    /**
     * @dev Confirms whether the investor is approved in a SAFT round.
     */
    function isApprovedSAFT(address holder) external view returns (bool) {
        return _vestingHolders[holder].approved;
    }

    /**
     * @dev Confirms whether the investor is in a registered state.
     */
    function isSAFTRegistered(address holder) external view returns (bool) {
        return _vestingHolders[holder].registered;
    }

    /**
     * @dev Returns the locked and unlocked (full) amount of tokens allocated to
     * the investor address in SAFT.
     */
    function getFullAmount(address holder) external view returns (uint) {
        return _vestingHolders[holder].fullAmount;
    }

    /**
     * @dev Returns the timestamp when lockup period ends. TODO: clarify lock/cliff
     */
    function getLockupPeriodTimestamp(address holder) external view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        SaftHolder memory saftHolder = _vestingHolders[holder];
        SAFTRound memory saftParams = _saftRounds[saftHolder.saftRoundId - 1];
        return timeHelpers.addMonths(saftHolder.startVestingTime, saftParams.lockupPeriod);
    }

    /**
     * @dev Returns the time of next unlock. TODO: change payment -> unlock
     */
    function getTimeOfNextPayment(address holder) external view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        uint date = now;
        SaftHolder memory saftHolder = _vestingHolders[holder];
        SAFTRound memory saftParams = _saftRounds[saftHolder.saftRoundId - 1];
        uint lockupDate = timeHelpers.addMonths(saftHolder.startVestingTime, saftParams.lockupPeriod);
        if (date < lockupDate) {
            return lockupDate;
        }
        uint dateMonth = timeHelpers.timestampToMonth(date);
        uint lockupMonth = timeHelpers.timestampToMonth(timeHelpers.addMonths(
            saftHolder.startVestingTime,
            saftParams.lockupPeriod
        ));
        uint finishMonth = timeHelpers.timestampToMonth(timeHelpers.addMonths(
            saftHolder.startVestingTime,
            saftParams.fullPeriod
        ));
        uint numberOfDonePayments = dateMonth.sub(lockupMonth).div(saftParams.regularPaymentTime);
        uint numberOfAllPayments = finishMonth.sub(lockupMonth).div(saftParams.regularPaymentTime);
        if (numberOfAllPayments <= numberOfDonePayments + 1) {
            return timeHelpers.addMonths(
                saftHolder.startVestingTime,
                saftParams.fullPeriod
            );
        }
        uint nextPayment = dateMonth.add(1).sub(lockupMonth).div(saftParams.regularPaymentTime);
        return timeHelpers.addMonths(lockupDate, nextPayment);
    }

    /**
     * @dev Returns the SAFT round parameters.
     *
     * Requirements:
     *
     * - SAFT round must already exist.
     */
    function getSAFTRound(uint saftRoundId) external view returns (SAFTRound memory) {
        require(saftRoundId < _saftRounds.length, "SAFT Round does not exist");
        return _saftRounds[saftRoundId];
    }

    /**
     * @dev Returns the SAFT round parameters for an investor address. TODO: rename Holder- > investor
     *
     * Requirements:
     *
     * - Investor address must be registered to a SAFT.
     */
    function getSAFTHolderParams(address holder) external view returns (SaftHolder memory) {
        require(_vestingHolders[holder].registered, "SAFT holder is not registered");
        return _vestingHolders[holder];
    }

    function initialize(address contractManagerAddress) public override initializer {
        Permissions.initialize(contractManagerAddress);
        // vestingManager = msg.sender;
        _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
        _erc1820.setInterfaceImplementer(address(this), keccak256("ERC777TokensRecipient"), address(this));
    }

    /**
     * @dev Returns the locked amount of tokens.
     */
    function getLockedAmount(address wallet) public view returns (uint) {
        return _vestingHolders[wallet].fullAmount - calculateAvailableAmount(wallet);
    }

    /**
     * @dev Calculates and returns the amount of unlocked tokens. TODO: available -> unlock
     */
    function calculateAvailableAmount(address wallet) public view returns (uint availableAmount) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        uint date = now;
        SaftHolder memory saftHolder = _vestingHolders[wallet];
        SAFTRound memory saftParams = _saftRounds[saftHolder.saftRoundId - 1];
        availableAmount = 0;
        if (date >= timeHelpers.addMonths(saftHolder.startVestingTime, saftParams.lockupPeriod)) {
            availableAmount = saftHolder.afterLockupAmount;
            if (date >= timeHelpers.addMonths(saftHolder.startVestingTime, saftParams.fullPeriod)) {
                availableAmount = saftHolder.fullAmount;
            } else {
                uint partPayment = _getPartPayment(wallet, saftHolder.fullAmount, saftHolder.afterLockupAmount);
                availableAmount = availableAmount.add(partPayment.mul(_getNumberOfPayments(wallet)));
            }
        }
    }

    /**
     * @dev Returns the number of unlocking actions that have occurred. TODO: payments-> unlock
     */
    function _getNumberOfPayments(address wallet) internal view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        uint date = now;
        SaftHolder memory saftHolder = _vestingHolders[wallet];
        SAFTRound memory saftParams = _saftRounds[saftHolder.saftRoundId - 1];
        if (date < timeHelpers.addMonths(saftHolder.startVestingTime, saftParams.lockupPeriod)) {
            return 0;
        }
        uint dateMonth = timeHelpers.timestampToMonth(date);
        uint lockupMonth = timeHelpers.timestampToMonth(timeHelpers.addMonths(
            saftHolder.startVestingTime,
            saftParams.lockupPeriod
        ));
        return dateMonth.sub(lockupMonth).div(saftParams.regularPaymentTime);
    }

    /**
     * @dev Returns the total number of unlocking actions. TODO: paymetn-> unlock
     */
    function _getNumberOfAllPayments(address wallet) internal view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        SaftHolder memory saftHolder = _vestingHolders[wallet];
        SAFTRound memory saftParams = _saftRounds[saftHolder.saftRoundId - 1];
        uint finishMonth = timeHelpers.timestampToMonth(
            timeHelpers.addMonths(saftHolder.startVestingTime, saftParams.fullPeriod)
        );
        uint afterLockupMonth = timeHelpers.timestampToMonth(timeHelpers.addMonths(
            saftHolder.startVestingTime,
            saftParams.lockupPeriod
        ));
        return finishMonth.sub(afterLockupMonth).div(saftParams.regularPaymentTime);
    }

    /**
     * @dev Returns the amount of tokens unlocked per unlocking period. TODO: clarify language
     */
    function _getPartPayment(
        address wallet,
        uint fullAmount,
        uint afterLockupPeriodAmount
    )
        internal
        view
        returns(uint)
    {
        return fullAmount.sub(afterLockupPeriodAmount).div(_getNumberOfAllPayments(wallet));
    }
}