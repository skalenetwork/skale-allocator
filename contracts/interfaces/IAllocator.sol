// SPDX-License-Identifier: AGPL-3.0-only

/*
    IAllocator.sol - SKALE Allocator
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


interface IAllocator {
    enum TimeUnit {
        DAY,
        MONTH,
        YEAR
    }

    enum BeneficiaryStatus {
        UNKNOWN,
        CONFIRMED,
        ACTIVE,
        TERMINATED
    }

    struct Plan {
        uint256 totalVestingDuration; // months
        uint256 vestingCliff; // months
        TimeUnit vestingIntervalTimeUnit;
        uint256 vestingInterval; // amount of days/months/years
        bool isDelegationAllowed;
        bool isTerminable;
    }

    struct Beneficiary {
        BeneficiaryStatus status;
        uint256 planId;
        uint256 startMonth;
        uint256 fullAmount;
        uint256 amountAfterLockup;
        address requestedAddress;
    }

    event PlanCreated(uint256 indexed id);

    event VersionUpdated(string oldVersion, string newVersion);

    function startVesting(address beneficiary) external;
    function addPlan(
        uint256 vestingCliff, // months
        uint256 totalVestingDuration, // months
        TimeUnit vestingIntervalTimeUnit, // 0 - day 1 - month 2 - year
        uint256 vestingInterval, // months or days or years
        bool canDelegate, // can beneficiary delegate all un-vested tokens
        bool isTerminable
    ) external;
    function connectBeneficiaryToPlan(
        address beneficiary,
        uint256 planId,
        uint256 startMonth,
        uint256 fullAmount,
        uint256 lockupAmount
    ) external;

    function stopVesting(address beneficiary) external;
    function setVersion(string calldata newVersion) external;
    function changeBeneficiaryAddress(address newBeneficiaryAddress) external;
    function confirmBeneficiaryAddress(address oldBeneficiaryAddress) external;
    function getStartMonth(address beneficiary) external view returns (uint256 startMonth);
    function getFinishVestingTime(address beneficiary) external view returns (uint256 finishTime);
    function getVestingCliffInMonth(address beneficiary) external view returns (uint256 cliff);
    function isVestingActive(address beneficiary) external view returns (bool isActive);
    function isBeneficiaryRegistered(address beneficiary) external view returns (bool isRegistered);
    function isDelegationAllowed(address beneficiary) external view returns (bool isAllowed);
    function getFullAmount(address beneficiary) external view returns (uint256 amount);
    function getEscrowAddress(address beneficiary) external view returns (address escrowAddress);
    function getLockupPeriodEndTimestamp(address beneficiary) external view returns (uint256 timestamp);
    function getTimeOfNextVest(address beneficiary) external view returns (uint256 timestamp);
    function getPlan(uint256 planId) external view returns (Plan memory plan);
    function getBeneficiaryPlanParams(address beneficiary) external view returns (Beneficiary memory beneficiaryPlan);
    function calculateVestedAmount(address wallet) external view returns (uint256 vestedAmount);
}
