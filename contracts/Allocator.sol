// SPDX-License-Identifier: AGPL-3.0-only

/*
    Allocator.sol - SKALE Allocator
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

// cspell:words prng

pragma solidity ^0.8.26;

import {
    TransparentUpgradeableProxy
} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    IERC777Recipient
} from "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";
import {
    IERC1820Registry
} from "@openzeppelin/contracts/utils/introspection/IERC1820Registry.sol";
import {
    ITimeHelpers
} from "@skalenetwork/skale-manager-interfaces/delegation/ITimeHelpers.sol";
import {Escrow} from "./Escrow.sol";
import {IAllocator} from "./interfaces/IAllocator.sol";
import {Permissions} from "./Permissions.sol";

/**
 * @title Allocator
 */
contract Allocator is Permissions, IERC777Recipient, IAllocator {

    uint256 private constant _SECONDS_PER_DAY = 24 * 60 * 60;
    uint256 private constant _MONTHS_PER_YEAR = 12;
    bytes32 public constant VESTING_MANAGER_ROLE = keccak256("VESTING_MANAGER_ROLE");


    IERC1820Registry private _erc1820;

    // array of Plan configs
    Plan[] private _plans;

    // beneficiary => beneficiary plan params
    mapping(address beneficiary => Beneficiary plan) private _beneficiaries;

    mapping(address beneficiary => Escrow escrowContract) private _beneficiaryToEscrow;

    string public version;
    error CallerNotVestingManager();
    error BeneficiaryAddressNull();
    error BeneficiaryAddressNotClean();
    error BeneficiaryChangeNotAllowed();
    error BeneficiaryStatusInappropriate();
    error TokenTransferFailed();
    error VestingDurationZero();
    error VestingIntervalZero();
    error CliffPeriodExceedsDuration();
    error VestingDurationNotDivisible();
    error PlanDoesNotExist();
    error IncorrectAmounts();
    error BeneficiaryAlreadyAdded();
    error BeneficiaryNotActive();
    error PlanNotTerminable();
    error VestingIsOver();
    error VestingStopped();
    error IncorrectVestingIntervalTimeUnit();
    error PlanRoundDoesNotExist();
    error BeneficiaryNotRegistered();
    error UnknownTimeUnit();
    error CalendarInternalError();
    error InvalidMonthRange();

    modifier onlyVestingManager() {
        require(
            hasRole(VESTING_MANAGER_ROLE, _msgSender()),
            CallerNotVestingManager()
        );
        _;
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

    function changeBeneficiaryAddress(address newBeneficiaryAddress) external override {
        require(newBeneficiaryAddress != address(0), BeneficiaryAddressNull());
        require(
            _beneficiaries[newBeneficiaryAddress].status ==
                BeneficiaryStatus.UNKNOWN,
            BeneficiaryAddressNotClean()
        );
        _beneficiaries[msg.sender].requestedAddress = newBeneficiaryAddress;
    }

    function confirmBeneficiaryAddress(address oldBeneficiaryAddress) external override {
        require(
            msg.sender == _beneficiaries[oldBeneficiaryAddress].requestedAddress,
            BeneficiaryChangeNotAllowed()
        );
        _beneficiaries[msg.sender] = Beneficiary({
            status: _beneficiaries[oldBeneficiaryAddress].status,
            planId: _beneficiaries[oldBeneficiaryAddress].planId,
            startMonth: _beneficiaries[oldBeneficiaryAddress].startMonth,
            fullAmount: _beneficiaries[oldBeneficiaryAddress].fullAmount,
            amountAfterLockup: _beneficiaries[oldBeneficiaryAddress].amountAfterLockup,
            requestedAddress: address(0)
        });
        _beneficiaryToEscrow[msg.sender] = _beneficiaryToEscrow[oldBeneficiaryAddress];
        delete _beneficiaries[oldBeneficiaryAddress];
        delete _beneficiaryToEscrow[oldBeneficiaryAddress];
        _beneficiaryToEscrow[msg.sender].changeBeneficiaryAddress(msg.sender);
    }

    /**
     * @dev Allows Vesting manager to activate a vesting and transfer locked
     * tokens from the Allocator contract to the associated Escrow address.
     *
     * Requirements:
     *
     * - Beneficiary address must be already confirmed.
     */
    function startVesting(address beneficiary) external override onlyVestingManager {
        require(
            _beneficiaries[beneficiary].status == BeneficiaryStatus.CONFIRMED,
            BeneficiaryStatusInappropriate()
        );
        _beneficiaries[beneficiary].status = BeneficiaryStatus.ACTIVE;
        require(
            IERC20(contractManager.getContract("SkaleToken")).transfer(
                address(_beneficiaryToEscrow[beneficiary]),
                _beneficiaries[beneficiary].fullAmount
            ),
            TokenTransferFailed()
        );
    }

    /**
     * @dev Allows Vesting manager to define and add a Plan.
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
        TimeUnit vestingIntervalTimeUnit, // 0 - day 1 - month 2 - year
        uint256 vestingInterval, // months or days or years
        bool canDelegate, // can beneficiary delegate all un-vested tokens
        bool isTerminable
    )
        external
        override
        onlyVestingManager
    {
        require(totalVestingDuration != 0, VestingDurationZero());
        require(vestingInterval != 0, VestingIntervalZero());
        require(
            !(totalVestingDuration < vestingCliff),
            CliffPeriodExceedsDuration()
        );
        // can't check if vesting interval in days is correct because it depends on startMonth
        // This check is in connectBeneficiaryToPlan
        if (vestingIntervalTimeUnit == TimeUnit.MONTH) {
            uint256 vestingDurationAfterCliff = totalVestingDuration - vestingCliff;
            require(
                vestingDurationAfterCliff % vestingInterval == 0,
                VestingDurationNotDivisible()
            );
        } else if (vestingIntervalTimeUnit == TimeUnit.YEAR) {
            uint256 vestingDurationAfterCliff = totalVestingDuration - vestingCliff;
            require(
                vestingDurationAfterCliff % (vestingInterval * _MONTHS_PER_YEAR) == 0,
                VestingDurationNotDivisible()
            );
        }

        _plans.push(
            Plan({
                totalVestingDuration: totalVestingDuration,
                vestingCliff: vestingCliff,
                vestingIntervalTimeUnit: vestingIntervalTimeUnit,
                vestingInterval: vestingInterval,
                isDelegationAllowed: canDelegate,
                isTerminable: isTerminable
            })
        );
        emit PlanCreated(_plans.length);
    }

    /**
     * @dev Allows Vesting manager to register a beneficiary to a Plan.
     *
     * Requirements:
     *
     * - Plan must already exist.
     * - The vesting amount must be less than or equal to the full allocation.
     * - The beneficiary address must not already be included in the any other Plan.
     */
    function connectBeneficiaryToPlan(
        address beneficiary,
        uint256 planId,
        uint256 startMonth,
        uint256 fullAmount,
        uint256 lockupAmount
    )
        external
        override
        onlyVestingManager
    {
        require(!(planId == 0 || planId > _plans.length), PlanDoesNotExist());
        require(!(fullAmount < lockupAmount), IncorrectAmounts());
        require(
            _beneficiaries[beneficiary].status == BeneficiaryStatus.UNKNOWN,
            BeneficiaryAlreadyAdded()
        );
        if (_plans[planId - 1].vestingIntervalTimeUnit == TimeUnit.DAY) {
            uint256 vestingDurationInDays = _daysBetweenMonths(
                startMonth + _plans[planId - 1].vestingCliff,
                startMonth + _plans[planId - 1].totalVestingDuration
            );
            require(
                vestingDurationInDays % _plans[planId - 1].vestingInterval == 0,
                VestingDurationNotDivisible()
            );
        }
        _beneficiaries[beneficiary] = Beneficiary({
            status: BeneficiaryStatus.CONFIRMED,
            planId: planId,
            startMonth: startMonth,
            fullAmount: fullAmount,
            amountAfterLockup: lockupAmount,
            requestedAddress: address(0)
        });
        _beneficiaryToEscrow[beneficiary] = _deployEscrow(beneficiary);
    }

    /**
     * @dev Allows Vesting manager to terminate vesting of a Escrow. Performed when
     * a beneficiary is terminated.
     *
     * Requirements:
     *
     * - Vesting must be active.
     */
    function stopVesting(address beneficiary) external override onlyVestingManager {
        require(
            _beneficiaries[beneficiary].status == BeneficiaryStatus.ACTIVE,
            BeneficiaryNotActive()
        );
        require(
            _plans[_beneficiaries[beneficiary].planId - 1].isTerminable,
            PlanNotTerminable()
        );
        _beneficiaries[beneficiary].status = BeneficiaryStatus.TERMINATED;
        Escrow(_beneficiaryToEscrow[beneficiary]).cancelVesting(
            calculateVestedAmount(beneficiary)
        );
    }

    /**
     * @dev Sets new version of contracts on schain
     *
     * Requirements:
     *
     * - `msg.sender` must be granted DEFAULT_ADMIN_ROLE
     */
    function setVersion(string calldata newVersion) external override onlyOwner {
        emit VersionUpdated(version, newVersion);
        version = newVersion;
    }

    /**
     * @dev Returns vesting start month of the beneficiary's Plan.
     */
    function getStartMonth(address beneficiary)
        external
        view
        override
        returns (uint256 startMonth)
    {
        return _beneficiaries[beneficiary].startMonth;
    }

    /**
     * @dev Returns the final vesting date of the beneficiary's Plan.
     */
    function getFinishVestingTime(address beneficiary) external view override returns (uint256 finishTime) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        Beneficiary memory beneficiaryPlan = _beneficiaries[beneficiary];
        Plan memory planParams = _plans[beneficiaryPlan.planId - 1];
        return
            timeHelpers.monthToTimestamp(
                beneficiaryPlan.startMonth + planParams.totalVestingDuration
            );
    }

    /**
     * @dev Returns the vesting cliff period in months.
     */
    function getVestingCliffInMonth(address beneficiary) external view override returns (uint256 cliff) {
        return _plans[_beneficiaries[beneficiary].planId - 1].vestingCliff;
    }

    /**
     * @dev Confirms whether the beneficiary is active in the Plan.
     */
    function isVestingActive(address beneficiary) external view override returns (bool isActive) {
        return _beneficiaries[beneficiary].status == BeneficiaryStatus.ACTIVE;
    }

    /**
     * @dev Confirms whether the beneficiary is registered in a Plan.
     */
    function isBeneficiaryRegistered(address beneficiary) external view override returns (bool isRegistered) {
        return _beneficiaries[beneficiary].status != BeneficiaryStatus.UNKNOWN;
    }

    /**
     * @dev Confirms whether the beneficiary's Plan allows all un-vested tokens to be
     * delegated.
     */
    function isDelegationAllowed(address beneficiary) external view override returns (bool isAllowed) {
        return
            _plans[_beneficiaries[beneficiary].planId - 1].isDelegationAllowed;
    }

    /**
     * @dev Returns the locked and unlocked (full) amount of tokens allocated to
     * the beneficiary address in Plan.
     */
    function getFullAmount(address beneficiary) external view override returns (uint256 amount) {
        return _beneficiaries[beneficiary].fullAmount;
    }

    /**
     * @dev Returns the Escrow contract by beneficiary.
     */
    function getEscrowAddress(address beneficiary) external view override returns (address escrowAddress) {
        return address(_beneficiaryToEscrow[beneficiary]);
    }

    /**
     * @dev Returns the timestamp when vesting cliff ends and periodic vesting
     * begins.
     */
    function getLockupPeriodEndTimestamp(address beneficiary) external view override returns (uint256 timestamp) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        Beneficiary memory beneficiaryPlan = _beneficiaries[beneficiary];
        Plan memory planParams = _plans[beneficiaryPlan.planId - 1];
        return
            timeHelpers.monthToTimestamp(
                beneficiaryPlan.startMonth + planParams.vestingCliff
            );
    }

    /**
     * @dev Returns the time of the next vesting event.
     */
    function getTimeOfNextVest(address beneficiary) external view override returns (uint256 timestamp) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        Beneficiary memory beneficiaryPlan = _beneficiaries[beneficiary];
        Plan memory planParams = _plans[beneficiaryPlan.planId - 1];
        uint256 firstVestingMonth = beneficiaryPlan.startMonth + planParams.vestingCliff;
        uint256 lockupEndTimestamp = timeHelpers.monthToTimestamp(firstVestingMonth);
        if (block.timestamp < lockupEndTimestamp) {
            return lockupEndTimestamp;
        }
        require(
            block.timestamp <
                timeHelpers.monthToTimestamp(
                    beneficiaryPlan.startMonth + planParams.totalVestingDuration
                ),
            VestingIsOver()
        );
        require(
            beneficiaryPlan.status != BeneficiaryStatus.TERMINATED,
            VestingStopped()
        );
        uint256 currentMonth = timeHelpers.getCurrentMonth();
        if (planParams.vestingIntervalTimeUnit == TimeUnit.DAY) {
            // TODO: it may be simplified if TimeHelpers contract in skale-manager is updated
            uint256 daysPassedBeforeCurrentMonth = _daysBetweenMonths(firstVestingMonth, currentMonth);
            uint256 currentMonthBeginningTimestamp = timeHelpers.monthToTimestamp(currentMonth);
            uint256 daysPassedInCurrentMonth = (block.timestamp - currentMonthBeginningTimestamp) / _SECONDS_PER_DAY;
            uint256 daysPassedBeforeNextVest = _calculateNextVestingStep(
                daysPassedBeforeCurrentMonth + daysPassedInCurrentMonth,
                planParams.vestingInterval
            );
            return currentMonthBeginningTimestamp +
                (daysPassedBeforeNextVest - daysPassedBeforeCurrentMonth) * _SECONDS_PER_DAY;
        } else if (planParams.vestingIntervalTimeUnit == TimeUnit.MONTH) {
            uint256 nextVestingMonthOffset = _calculateNextVestingStep(
                currentMonth - firstVestingMonth,
                planParams.vestingInterval
            );
            return timeHelpers.monthToTimestamp(firstVestingMonth + nextVestingMonthOffset);
        } else if (planParams.vestingIntervalTimeUnit == TimeUnit.YEAR) {
            return
                timeHelpers.monthToTimestamp(
                    firstVestingMonth +
                        _calculateNextVestingStep(
                            currentMonth - firstVestingMonth,
                            planParams.vestingInterval * _MONTHS_PER_YEAR
                        )
                );
        } else {
            revert IncorrectVestingIntervalTimeUnit();
        }
    }

    /**
     * @dev Returns the Plan parameters.
     *
     * Requirements:
     *
     * - Plan must already exist.
     */
    function getPlan(uint256 planId) external view override returns (Plan memory plan) {
        require(
            !(planId == 0 || planId > _plans.length),
            PlanRoundDoesNotExist()
        );
        return _plans[planId - 1];
    }

    /**
     * @dev Returns the Plan parameters for a beneficiary address.
     *
     * Requirements:
     *
     * - Beneficiary address must be registered to an Plan.
     */
    function getBeneficiaryPlanParams(
        address beneficiary
    )
        external
        view
        override
        returns (Beneficiary memory beneficiaryPlan)
    {
        require(
            _beneficiaries[beneficiary].status != BeneficiaryStatus.UNKNOWN,
            BeneficiaryNotRegistered()
        );
        return _beneficiaries[beneficiary];
    }

    function initialize(address contractManagerAddress) public override initializer {
        Permissions.initialize(contractManagerAddress);
        _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
        _erc1820.setInterfaceImplementer(address(this), keccak256("ERC777TokensRecipient"), address(this));
    }

    /**
     * @dev Calculates and returns the vested token amount.
     */
    function calculateVestedAmount(address wallet) public view override returns (uint256 vestedAmount) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        Beneficiary memory beneficiaryPlan = _beneficiaries[wallet];
        Plan memory planParams = _plans[beneficiaryPlan.planId - 1];
        vestedAmount = 0;
        uint256 currentMonth = timeHelpers.getCurrentMonth();
        if (!(currentMonth < beneficiaryPlan.startMonth + planParams.vestingCliff)) {
            vestedAmount = beneficiaryPlan.amountAfterLockup;
            if (!(currentMonth < beneficiaryPlan.startMonth + planParams.totalVestingDuration)) {
                vestedAmount = beneficiaryPlan.fullAmount;
            } else {
                uint256 payment = _getSinglePaymentSize(
                    wallet,
                    beneficiaryPlan.fullAmount,
                    beneficiaryPlan.amountAfterLockup
                );
                vestedAmount = vestedAmount + payment * _getNumberOfCompletedVestingEvents(wallet);
            }
        }
    }

    /**
     * @dev Returns the number of vesting events that have completed.
     */
    function _getNumberOfCompletedVestingEvents(
        address wallet
    ) internal view returns (uint256 count) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        Beneficiary memory beneficiaryPlan = _beneficiaries[wallet];
        Plan memory planParams = _plans[beneficiaryPlan.planId - 1];
        uint256 firstVestingMonth = beneficiaryPlan.startMonth + planParams.vestingCliff;
        if (block.timestamp < timeHelpers.monthToTimestamp(firstVestingMonth)) {
            return 0;
        } else {
            uint256 currentMonth = timeHelpers.getCurrentMonth();
            if (planParams.vestingIntervalTimeUnit == TimeUnit.DAY) {
                return
                    (_daysBetweenMonths(firstVestingMonth, currentMonth) +
                        (block.timestamp - timeHelpers.monthToTimestamp(currentMonth)) / _SECONDS_PER_DAY
                    ) / planParams.vestingInterval;
            } else if (planParams.vestingIntervalTimeUnit == TimeUnit.MONTH) {
                return (currentMonth - firstVestingMonth) / planParams.vestingInterval;
            } else if (planParams.vestingIntervalTimeUnit == TimeUnit.YEAR) {
                return (currentMonth - firstVestingMonth) / _MONTHS_PER_YEAR / planParams.vestingInterval;
            } else {
                revert UnknownTimeUnit();
            }
        }
    }

    /**
     * @dev Returns the number of total vesting events.
     */
    function _getNumberOfAllVestingEvents(address wallet) internal view returns (uint256 count) {
        Beneficiary memory beneficiaryPlan = _beneficiaries[wallet];
        Plan memory planParams = _plans[beneficiaryPlan.planId - 1];
        if (planParams.vestingIntervalTimeUnit == TimeUnit.DAY) {
            return
                _daysBetweenMonths(
                    beneficiaryPlan.startMonth + planParams.vestingCliff,
                    beneficiaryPlan.startMonth + planParams.totalVestingDuration
                ) / planParams.vestingInterval;
        } else if (planParams.vestingIntervalTimeUnit == TimeUnit.MONTH) {
            return (planParams.totalVestingDuration - planParams.vestingCliff) / planParams.vestingInterval;
        } else if (planParams.vestingIntervalTimeUnit == TimeUnit.YEAR) {
            return
                (planParams.totalVestingDuration - planParams.vestingCliff) /
                _MONTHS_PER_YEAR /
                planParams.vestingInterval;
        } else {
            revert UnknownTimeUnit();
        }
    }

    /**
     * @dev Returns the amount of tokens that are unlocked in each vesting
     * period.
     */
    function _getSinglePaymentSize(
        address wallet,
        uint256 fullAmount,
        uint256 afterLockupPeriodAmount
    )
        internal
        view
        returns (uint256 amount)
    {
        return (fullAmount - afterLockupPeriodAmount) / _getNumberOfAllVestingEvents(wallet);
    }

    /**
     * @dev Deploys a new Escrow contract for a beneficiary.
     */
    function _deployEscrow(address beneficiary) private returns (Escrow escrowContract) {
        address proxyAdmin = contractManager.getContract("ProxyAdmin");
        address escrowImplementation = contractManager.getContract("EscrowImplementation");
        bytes memory initializingData = abi.encodeWithSignature(
            "initialize(address,address)", address(contractManager), beneficiary
        );
        address beneficiaryEscrow = address(
            new TransparentUpgradeableProxy(
                escrowImplementation,
                proxyAdmin,
                initializingData
            )
        );
        return Escrow(beneficiaryEscrow);
    }

    /**
     * @dev Calculates the number of days between two months.
     */
    function _daysBetweenMonths(uint256 beginMonth, uint256 endMonth) private view returns (uint256 daysCount) {
        assert(!(beginMonth > endMonth));
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        uint256 beginTimestamp = timeHelpers.monthToTimestamp(beginMonth);
        uint256 endTimestamp = timeHelpers.monthToTimestamp(endMonth);
        uint256 secondsPassed = endTimestamp - beginTimestamp;
        require(secondsPassed % _SECONDS_PER_DAY == 0, CalendarInternalError());
        return secondsPassed / _SECONDS_PER_DAY;
    }

    /**
     * @dev returns time of next vest in abstract time units named "step"
     * Examples:
     *     if current step is 5 and vesting interval is 7 function returns 7.
     *     if current step is 17 and vesting interval is 7 function returns 21.
     */
    function _calculateNextVestingStep(
        uint256 currentStep,
        uint256 vestingInterval
    )
        private
        pure
        returns (uint256 nextStep)
    {
        // Unavoidable use of weak PRNG
        // slither-disable-next-line weak-prng
        return currentStep + vestingInterval - currentStep % vestingInterval;
    }
}
