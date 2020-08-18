// SPDX-License-Identifier: AGPL-3.0-only

/*
    Allocator.sol - SKALE Allocator
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
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC777/IERC777Recipient.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "./interfaces/openzeppelin/IProxyFactory.sol";
import "./interfaces/openzeppelin/IProxyAdmin.sol";
import "./interfaces/ITimeHelpers.sol";
import "./Escrow.sol";
import "./Permissions.sol";

/**
 * @title Allocator
 */
contract Allocator is Permissions, IERC777Recipient {

    enum TimeUnit {DAY, MONTH, YEAR}

    enum SubjectStatus {
        UNKNOWN,
        CONFIRMATION_PENDING,
        CONFIRMED,
        ACTIVE,
        TERMINATED
    }

    struct Plan {
        uint256 totalVestingDuration; // months
        uint256 vestingCliff; // months
        TimeUnit vestingStepTimeUnit;
        uint256 vestingStep; // amount of days/months/years
        bool isDelegationAllowed;
        bool isTerminatable;
    }

    struct Subject {
        SubjectStatus status;
        uint256 planId;
        uint256 startMonth;
        uint256 fullAmount;
        uint256 amountAfterLockup;
    }

    event PlanCreated(
        uint256 id
    );

    IERC1820Registry private _erc1820;

    // array of Plan configs
    Plan[] private _plans;

    bytes32 public constant VESTING_MANAGER_ROLE = keccak256("VESTING_MANAGER_ROLE");

    //       subject => subject plan params
    mapping (address => Subject) private _subjects;

    //       subject => Escrow
    mapping (address => Escrow) private _subjectToEscrow;

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
     * @dev Allows `msg.sender` to approve their address as a Subject.
     *
     * Requirements:
     *
     * - Subject address must be already registered.
     * - Subject address must not already be approved.
     */
    function approveAddress() external {
        address subject = msg.sender;
        require(_subjects[subject].status != SubjectStatus.UNKNOWN, "Subject is not registered");
        require(_subjects[subject].status == SubjectStatus.CONFIRMATION_PENDING, "Subject is already approved");
        _subjects[subject].status = SubjectStatus.CONFIRMED;
    }

    /**
     * @dev Allows Owner to activate a vestring and transfer locked
     * tokens from the Allocator contract to the associated Ecrow address.
     *
     * Requirements:
     *
     * - Subject address must be already confirmed.
     */
    function startVesting(address subject) external onlyOwner {
        require(_subjects[subject].status == SubjectStatus.CONFIRMED, "Subject has inappropriate status");
        _subjects[subject].status = SubjectStatus.ACTIVE;
        require(
            IERC20(contractManager.getContract("SkaleToken")).transfer(
                address(_subjectToEscrow[subject]),
                _subjects[subject].fullAmount
            ),
            "Error of token sending"
        );
    }

    /**
     * @dev Allows Owner to define and add a Plan.
     *
     * Requirements:
     *
     * - Vesting cliff period must be less than or equal to the full period.
     * - Vesting step time unit must be in days, months, or years.
     * - Total vesting duration must equal vesting cliff plus entire vesting schedule.
     */
    function addPlan(
        uint256 vestingCliff, // months
        uint256 totalVestingDuration, // months
        uint8 vestingStepTimeUnit, // 1 - day 2 - month 3 - year
        uint256 vestingTimes, // months or days or years
        bool canDelegate, // can subject delegate all un-vested tokens
        bool isTerminatable
    )
        external
        onlyOwner
    {
        require(totalVestingDuration >= vestingCliff, "Cliff period exceeds full period");
        require(vestingStepTimeUnit >= 1 && vestingStepTimeUnit <= 3, "Incorrect vesting period");
        require(
            (totalVestingDuration - vestingCliff) == vestingTimes ||
            ((totalVestingDuration - vestingCliff) / vestingTimes) * vestingTimes
                == totalVestingDuration - vestingCliff,
            "Incorrect vesting times"
        );
        _plans.push(Plan({
            totalVestingDuration: totalVestingDuration,
            vestingCliff: vestingCliff,
            vestingStepTimeUnit: TimeUnit(vestingStepTimeUnit - 1),
            vestingStep: vestingTimes,
            isDelegationAllowed: canDelegate,
            isTerminatable: isTerminatable
        }));
        emit PlanCreated(_plans.length);
    }

    /**
     * @dev Allows Owner to terminate vesting of a Escrow. Performed when
     * a subject is terminated.
     *
     * Requirements:
     *
     * - Vestring must be active.
     */
    function stopVesting(address subject) external onlyOwner {
        require(
            _subjects[subject].status == SubjectStatus.ACTIVE,
            "Cannot stop vesting for a non active subject"
        );
        require(
            _plans[_subjects[subject].planId - 1].isTerminatable,
            "Can't stop vesting for subject with this plan"
        );
        _subjects[subject].status = SubjectStatus.TERMINATED;
        Escrow(_subjectToEscrow[subject]).cancelVesting(calculateVestedAmount(subject));
    }

    /**
     * @dev Allows Owner to register a subject to a Plan.
     *
     * Requirements:
     *
     * - Plan must already exist.
     * - The vesting amount must be less than or equal to the full allocation.
     * - The subject address must not already be included in the any other Plan.
     */
    function connectSubjectToPlan(
        address subject,
        uint256 planId,
        uint256 startMonth, // timestamp
        uint256 fullAmount,
        uint256 lockupAmount
    )
        external
        onlyOwner
    {
        require(_plans.length >= planId && planId > 0, "Plan does not exist");
        require(fullAmount >= lockupAmount, "Incorrect amounts");
        // require(startMonth <= now, "Incorrect period starts");
        // TODO: Remove to allow both past and future vesting start date
        require(_subjects[subject].status == SubjectStatus.UNKNOWN, "Subject is already added");
        _subjects[subject] = Subject({
            status: SubjectStatus.CONFIRMATION_PENDING,
            planId: planId,
            startMonth: startMonth,
            fullAmount: fullAmount,
            amountAfterLockup: lockupAmount
        });
        _subjectToEscrow[subject] = _deployEscrow(subject);
    }

    /**
     * @dev Returns vesting start month of the subject's Plan.
     */
    function getStartMonth(address subject) external view returns (uint) {
        return _subjects[subject].startMonth;
    }

    /**
     * @dev Returns the final vesting date of the subject's Plan.
     */
    function getFinishVestingTime(address subject) external view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        Subject memory subjectPlan = _subjects[subject];
        Plan memory planParams = _plans[subjectPlan.planId - 1];
        return timeHelpers.addMonths(subjectPlan.startMonth, planParams.totalVestingDuration);
    }

    /**
     * @dev Returns the vesting cliff period in months.
     */
    function getVestingCliffInMonth(address subject) external view returns (uint) {
        return _plans[_subjects[subject].planId - 1].vestingCliff;
    }

    /**
     * @dev Confirms whether the subject is active in the Plan.
     */
    function isVestingActive(address subject) external view returns (bool) {
        return _subjects[subject].status == SubjectStatus.ACTIVE;
    }

    /**
     * @dev Confirms whether the subject is approved in a Plan.
     */
    function isSubjectAddressApproved(address subject) external view returns (bool) {
        return _subjects[subject].status != SubjectStatus.UNKNOWN &&
            _subjects[subject].status != SubjectStatus.CONFIRMATION_PENDING;
    }

    /**
     * @dev Confirms whether the subject is registered in a Plan.
     */
    function isSubjectRegistered(address subject) external view returns (bool) {
        return _subjects[subject].status != SubjectStatus.UNKNOWN;
    }

    /**
     * @dev Confirms whether the subject's Plan allows all un-vested tokens to be
     * delegated.
     */
    function isDelegationAllowed(address subject) external view returns (bool) {
        return _plans[_subjects[subject].planId - 1].isDelegationAllowed;
    }

    /**
     * @dev Returns the locked and unlocked (full) amount of tokens allocated to
     * the subject address in Plan.
     */
    function getFullAmount(address subject) external view returns (uint) {
        return _subjects[subject].fullAmount;
    }

    /**
     * @dev Returns the Escrow contract by subject.
     */
    function getEscrowAddress(address subject) external view returns (address) {
        return address(_subjectToEscrow[subject]);
    }

    /**
     * @dev Returns the timestamp when vesting cliff ends and periodic vesting
     * begins.
     */
    function getLockupPeriodTimestamp(address subject) external view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        Subject memory subjectPlan = _subjects[subject];
        Plan memory planParams = _plans[subjectPlan.planId - 1];
        return timeHelpers.addMonths(subjectPlan.startMonth, planParams.vestingCliff);
    }

    /**
     * @dev Returns the time of the next vesting period.
     */
    function getTimeOfNextVest(address subject) external view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        uint256 date = now;
        Subject memory subjectPlan = _subjects[subject];
        Plan memory planParams = _plans[subjectPlan.planId - 1];
        uint256 lockupDate = timeHelpers.addMonths(subjectPlan.startMonth, planParams.vestingCliff);
        if (date < lockupDate) {
            return lockupDate;
        }
        uint256 dateTime = _getTimePointInCorrectPeriod(date, planParams.vestingStepTimeUnit);
        uint256 lockupTime = _getTimePointInCorrectPeriod(
            timeHelpers.addMonths(subjectPlan.startMonth, planParams.vestingCliff),
            planParams.vestingStepTimeUnit
        );
        uint256 finishTime = _getTimePointInCorrectPeriod(
            timeHelpers.addMonths(subjectPlan.startMonth, planParams.totalVestingDuration),
            planParams.vestingStepTimeUnit
        );
        uint256 numberOfDonePayments = dateTime.sub(lockupTime).div(planParams.vestingStep);
        uint256 numberOfAllPayments = finishTime.sub(lockupTime).div(planParams.vestingStep);
        if (numberOfAllPayments <= numberOfDonePayments + 1) {
            return timeHelpers.addMonths(
                subjectPlan.startMonth,
                planParams.totalVestingDuration
            );
        }
        uint256 nextPayment = finishTime
            .sub(
                planParams.vestingStep.mul(numberOfAllPayments.sub(numberOfDonePayments + 1))
            );
        return _addMonthsAndTimePoint(lockupDate, nextPayment - lockupTime, planParams.vestingStepTimeUnit);
    }

    /**
     * @dev Returns the Plan parameters.
     *
     * Requirements:
     *
     * - Plan must already exist.
     */
    function getPlan(uint256 planId) external view returns (Plan memory) {
        require(planId > 0 && planId <= _plans.length, "Plan Round does not exist");
        return _plans[planId - 1];
    }

    /**
     * @dev Returns the Plan parameters for a subject address.
     *
     * Requirements:
     *
     * - Subject address must be registered to an Plan.
     */
    function getSubjectPlanParams(address subject) external view returns (Subject memory) {
        require(_subjects[subject].status != SubjectStatus.UNKNOWN, "Plan subject is not registered");
        return _subjects[subject];
    }

    /**
     * @dev Returns the locked token amount. TODO: remove, controlled by Escrow
     */
    function getLockedAmount(address wallet) external view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        Subject memory subjectPlan = _subjects[wallet];
        Plan memory planParams = _plans[subjectPlan.planId - 1];
        if (now < timeHelpers.addMonths(subjectPlan.startMonth, planParams.vestingCliff)) {
            return _subjects[wallet].fullAmount;
        }
        return _subjects[wallet].fullAmount - calculateVestedAmount(wallet);
    }

    function initialize(address contractManagerAddress) public override initializer {
        Permissions.initialize(contractManagerAddress);
        _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
        _erc1820.setInterfaceImplementer(address(this), keccak256("ERC777TokensRecipient"), address(this));
    }

    /**
     * @dev Calculates and returns the vested token amount.
     */
    function calculateVestedAmount(address wallet) public view returns (uint256 vestedAmount) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        uint256 date = now;
        Subject memory subjectPlan = _subjects[wallet];
        Plan memory planParams = _plans[subjectPlan.planId - 1];
        vestedAmount = 0;
        if (date >= timeHelpers.addMonths(subjectPlan.startMonth, planParams.vestingCliff)) {
            vestedAmount = subjectPlan.amountAfterLockup;
            if (date >= timeHelpers.addMonths(subjectPlan.startMonth, planParams.totalVestingDuration)) {
                vestedAmount = subjectPlan.fullAmount;
            } else {
                uint256 partPayment = _getPartPayment(wallet, subjectPlan.fullAmount, subjectPlan.amountAfterLockup);
                vestedAmount = vestedAmount.add(partPayment.mul(_getNumberOfCompletedVestingEvents(wallet)));
            }
        }
    }

    /**
     * @dev Returns the number of vesting events that have completed.
     */
    function _getNumberOfCompletedVestingEvents(address wallet) internal view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        uint256 date = now;
        Subject memory subjectPlan = _subjects[wallet];
        Plan memory planParams = _plans[subjectPlan.planId - 1];
        if (date < timeHelpers.addMonths(subjectPlan.startMonth, planParams.vestingCliff)) {
            return 0;
        }
        uint256 dateTime = _getTimePointInCorrectPeriod(date, planParams.vestingStepTimeUnit);
        uint256 lockupTime = _getTimePointInCorrectPeriod(
            timeHelpers.addMonths(subjectPlan.startMonth, planParams.vestingCliff),
            planParams.vestingStepTimeUnit
        );
        return dateTime.sub(lockupTime).div(planParams.vestingStep);
    }

    /**
     * @dev Returns the number of total vesting events.
     */
    function _getNumberOfAllVestingEvents(address wallet) internal view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        Subject memory subjectPlan = _subjects[wallet];
        Plan memory planParams = _plans[subjectPlan.planId - 1];
        uint256 finishTime = _getTimePointInCorrectPeriod(
            timeHelpers.addMonths(subjectPlan.startMonth, planParams.totalVestingDuration),
            planParams.vestingStepTimeUnit
        );
        uint256 afterLockupTime = _getTimePointInCorrectPeriod(
            timeHelpers.addMonths(subjectPlan.startMonth, planParams.vestingCliff),
            planParams.vestingStepTimeUnit
        );
        return finishTime.sub(afterLockupTime).div(planParams.vestingStep);
    }

    /**
     * @dev Returns the amount of tokens that are unlocked in each vesting
     * period.
     */
    function _getPartPayment(
        address wallet,
        uint256 fullAmount,
        uint256 afterLockupPeriodAmount
    )
        internal
        view
        returns(uint)
    {
        return fullAmount.sub(afterLockupPeriodAmount).div(_getNumberOfAllVestingEvents(wallet));
    }

    /**
     * @dev Returns timestamp when adding timepoints (days/months/years) to
     * timestamp.
     */
    function _getTimePointInCorrectPeriod(uint256 timestamp, TimeUnit vestingStepTimeUnit) private view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        if (vestingStepTimeUnit == TimeUnit.DAY) {
            return timeHelpers.timestampToDay(timestamp);
        } else if (vestingStepTimeUnit == TimeUnit.MONTH) {
            return timeHelpers.timestampToMonth(timestamp);
        } else {
            return timeHelpers.timestampToYear(timestamp);
        }
    }

    /**
     * @dev Returns timepoints (days/months/years) from a given timestamp.
     */
    function _addMonthsAndTimePoint(
        uint256 timestamp,
        uint256 timePoints,
        TimeUnit vestingStepTimeUnit
    )
        private
        view
        returns (uint)
    {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        if (vestingStepTimeUnit == TimeUnit.DAY) {
            return timeHelpers.addDays(timestamp, timePoints);
        } else if (vestingStepTimeUnit == TimeUnit.MONTH) {
            return timeHelpers.addMonths(timestamp, timePoints);
        } else {
            return timeHelpers.addYears(timestamp, timePoints);
        }
    }

    function _deployEscrow(address subject) private returns (Escrow) {
        // TODO: replace with ProxyFactory when @openzeppelin/upgrades will be compatible with solidity 0.6
        IProxyFactory proxyFactory = IProxyFactory(contractManager.getContract("ProxyFactory"));
        Allocator allocator = Allocator(contractManager.getContract("Allocator"));
        // TODO: change address to ProxyAdmin when @openzeppelin/upgrades will be compatible with solidity 0.6
        IProxyAdmin proxyAdmin = IProxyAdmin(contractManager.getContract("ProxyAdmin"));

        return Escrow(
            proxyFactory.deploy(
                uint256(bytes32(bytes20(subject))),
                proxyAdmin.getProxyImplementation(address(allocator)),
                address(proxyAdmin),
                abi.encodeWithSelector(
                    Escrow.initialize.selector,
                    address(contractManager),
                    subject
                )
            )
        );
    }
}