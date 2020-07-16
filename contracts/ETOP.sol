/*
    ETOP.sol - SKALE Manager
    Copyright (C) 2019-Present SKALE Labs
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
import "./Permissions.sol";


contract ETOP is ILocker, Permissions, IERC777Recipient {

    enum TimeLine {DAY, MONTH, YEAR}

    struct Plan {
        uint fullPeriod;
        uint lockupPeriod; // months
        TimeLine vestingPeriod;
        uint regularPaymentTime; // amount of days/months/years
        bool isUnvestedDelegatable;
    }

    struct PlanHolder {
        bool registered;
        bool approved;
        bool active;
        uint planId;
        uint startVestingTime;
        uint fullAmount;
        uint afterLockupAmount;
    }

    IERC1820Registry private _erc1820;

    // array of Plan configs
    Plan[] private _allPlans;

    address public vestingManager;

    mapping (address => uint) private _vestedAmount;

    //        holder => Plan holder params
    mapping (address => PlanHolder) private _vestingHolders;

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

    function approveHolder() external {
        address holder = msg.sender;
        require(_vestingHolders[holder].registered, "Holder is not registered");
        require(!_vestingHolders[holder].approved, "Holder is already approved");
        _vestingHolders[holder].approved = true;
    }

    function startVesting(address holder) external onlyOwner {
        require(_vestingHolders[holder].registered, "Holder is not registered");
        require(_vestingHolders[holder].approved, "Holder is not approved");
        _vestingHolders[holder].active = true;
        require(
            IERC20(contractManager.getContract("SkaleToken")).transfer(
                _holderToEscrow[holder],
                _vestingHolders[holder].fullAmount
            ),
            "Error of token sending"
        );
    }

    function addVestingPlan(
        uint lockupPeriod, // months
        uint fullPeriod, // months
        uint8 vestingPeriod, // 1 - day 2 - month 3 - year
        uint vestingTimes, // months or days or years
        bool isCancelable, // could owner cancel this plan
        bool isUnvestedDelegatable // could holder delegate
    )
        external
        onlyOwner
    {
        // ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        require(fullPeriod >= lockupPeriod, "Incorrect periods");
        require(vestingPeriod >= 1 && vestingPeriod <= 3, "Incorrect vesting period");
        require(
            (fullPeriod - lockupPeriod) == vestingTimes ||
            ((fullPeriod - lockupPeriod) / vestingTimes) * vestingTimes == fullPeriod - lockupPeriod,
            "Incorrect vesting times"
        );
        _allPlans.push(Plan({
            fullPeriod: fullPeriod,
            lockupPeriod: lockupPeriod,
            vestingPeriod: TimeLine(vestingPeriod - 1),
            regularPaymentTime: vestingTimes,
            isCancelable: isCancelable,
            isUnvestedDelegatable: isUnvestedDelegatable
        }));
    }

    function stopVesting(address holder) external onlyOwner {
        require(
            !_vestingHolders[holder].active,
            "You could not stop vesting for this holder"
        );
        _vestedAmount[holder] = calculateAvailableAmount(holder);
        VestingEscrow vestingEscrow = VestingEscrow(_holderToEscrow[holder]);
        vestingEscrow.cancelVesting();
    }

    function connectHolderToPlan(
        address holder,
        uint planId,
        uint startVestingTime, //timestamp
        uint fullAmount,
        uint lockupAmount
    )
        external
        onlyOwner
    {
        require(_allPlans.length >= planId, "Holder round does not exist");
        require(fullAmount >= lockupAmount, "Incorrect amounts");
        require(startVestingTime <= now, "Incorrect period starts");
        require(!_vestingHolders[holder].registered, "Holder holder is already added");
        _vestingHolders[holder] = PlanHolder({
            registered: true,
            approved: false,
            active: false,
            planId: planId,
            startVestingTime: startVestingTime,
            fullAmount: fullAmount,
            afterLockupAmount: lockupAmount
        });
        // VestingEscrow vestingEscrow = new VestingEscrow(address(contractManager), holder);
        _holderToEscrow[holder] = address(new VestingEscrow(address(contractManager), holder));
    }

    function getAndUpdateLockedAmount(address wallet) external override returns (uint) {
        if (! _vestingHolders[wallet].active) {
            return 0;
        }
        return getLockedAmount(wallet);
    }

    function getAndUpdateForbiddenForDelegationAmount(address wallet) external override returns (uint) {
        if (!_allPlans[_vestingHolders[wallet].planId].isUnvestedDelegatable) {
            return getLockedAmountForDelegation(wallet);
        }
        // metwork_launch_timestamp
        return 0;
    }

    function getStartVestingTime(address holder) external view returns (uint) {
        return _vestingHolders[holder].startVestingTime;
    }

    function getFinishVestingTime(address holder) external view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        PlanHolder memory planHolder = _vestingHolders[holder];
        Plan memory planParams = _allPlans[planHolder.planId - 1];
        return timeHelpers.addMonths(planHolder.startVestingTime, planParams.fullPeriod);
    }

    function getLockupPeriodInMonth(address holder) external view returns (uint) {
        return _allPlans[_vestingHolders[holder].planId - 1].lockupPeriod;
    }

    function isActiveVestingTerm(address holder) external view returns (bool) {
        return _vestingHolders[holder].active;
    }

    function isApprovedHolder(address holder) external view returns (bool) {
        return _vestingHolders[holder].approved;
    }

    function isHolderRegistered(address holder) external view returns (bool) {
        return _vestingHolders[holder].registered;
    }

    function isCancelableVestingTerm(address holder) external view returns (bool) {
        return _allPlans[_vestingHolders[holder].planId - 1].isCancelable;
    }

    function getFullAmount(address holder) external view returns (uint) {
        return _vestingHolders[holder].fullAmount;
    }

    function getLockupPeriodTimestamp(address holder) external view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        PlanHolder memory planHolder = _vestingHolders[holder];
        Plan memory planParams = _allPlans[planHolder.planId - 1];
        return timeHelpers.addMonths(planHolder.startVestingTime, planParams.lockupPeriod);
    }

    function getTimeOfNextPayment(address holder) external view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        uint date = now;
        PlanHolder memory planHolder = _vestingHolders[holder];
        Plan memory planParams = _allPlans[planHolder.planId - 1];
        uint lockupDate = timeHelpers.addMonths(planHolder.startVestingTime, planParams.lockupPeriod);
        if (date < lockupDate) {
            return lockupDate;
        }
        uint dateMonth = timeHelpers.timestampToMonth(date);
        uint lockupMonth = timeHelpers.timestampToMonth(timeHelpers.addMonths(
            planHolder.startVestingTime,
            planParams.lockupPeriod
        ));
        uint finishMonth = timeHelpers.timestampToMonth(timeHelpers.addMonths(
            planHolder.startVestingTime,
            planParams.fullPeriod
        ));
        uint numberOfDonePayments = dateMonth.sub(lockupMonth).div(planParams.regularPaymentTime);
        uint numberOfAllPayments = finishMonth.sub(lockupMonth).div(planParams.regularPaymentTime);
        if (numberOfAllPayments <= numberOfDonePayments + 1) {
            return timeHelpers.addMonths(
                planHolder.startVestingTime,
                planParams.fullPeriod
            );
        }
        uint nextPayment = dateMonth.add(1).sub(lockupMonth).div(planParams.regularPaymentTime);
        return timeHelpers.addMonths(lockupDate, nextPayment);
    }

    function getPlan(uint planId) external view returns (Plan memory) {
        require(planId < _allPlans.length, "Plan Round does not exist");
        return _allPlans[planId];
    }

    function getHolderParams(address holder) external view returns (PlanHolder memory) {
        require(_vestingHolders[holder].registered, "Plan holder is not registered");
        return _vestingHolders[holder];
    }

    function initialize(address contractManagerAddress) public override initializer {
        Permissions.initialize(contractManagerAddress);
        vestingManager = msg.sender;
        _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
        _erc1820.setInterfaceImplementer(address(this), keccak256("ERC777TokensRecipient"), address(this));
    }

    function getLockedAmount(address wallet) public view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        PlanHolder memory planHolder = _vestingHolders[wallet];
        Plan memory planParams = _allPlans[planHolder.planId - 1];
        if (now < timeHelpers.addMonths(planHolder.startVestingTime, planParams.lockupPeriod)) {
            return _vestingHolders[wallet].fullAmount;
        }
        return _vestingHolders[wallet].fullAmount - calculateAvailableAmount(wallet);
    }

    function getLockedAmountForDelegation(address wallet) public view returns (uint) {
        return _vestingHolders[wallet].fullAmount - calculateAvailableAmount(wallet);
    }

    function calculateAvailableAmount(address wallet) public view returns (uint availableAmount) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        uint date = now;
        PlanHolder memory planHolder = _vestingHolders[wallet];
        Plan memory planParams = _allPlans[planHolder.planId - 1];
        availableAmount = 0;
        // if (date >= timeHelpers.addMonths(planHolder.startVestingTime, planParams.lockupPeriod)) {
        //     availableAmount = planHolder.afterLockupAmount;
            if (date >= timeHelpers.addMonths(planHolder.startVestingTime, planParams.fullPeriod)) {
                availableAmount = planHolder.fullAmount;
            } else {
                uint partPayment = _getPartPayment(wallet, planHolder.fullAmount, planHolder.afterLockupAmount);
                availableAmount = availableAmount.add(partPayment.mul(_getNumberOfPayments(wallet)));
            }
        // }
    }

    function _getNumberOfPayments(address wallet) internal view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        uint date = now;
        PlanHolder memory planHolder = _vestingHolders[wallet];
        Plan memory planParams = _allPlans[planHolder.planId - 1];
        // if (date < timeHelpers.addMonths(planHolder.startVestingTime, planParams.lockupPeriod)) {
        //     return 0;
        // }
        uint dateMonth = timeHelpers.timestampToMonth(date);
        // uint lockupMonth = timeHelpers.timestampToMonth(timeHelpers.addMonths(
        //     planHolder.startVestingTime,
        //     planParams.lockupPeriod
        // ));
        return dateMonth.div(planParams.regularPaymentTime);
    }

    function _getNumberOfAllPayments(address wallet) internal view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        PlanHolder memory planHolder = _vestingHolders[wallet];
        Plan memory planParams = _allPlans[planHolder.planId - 1];
        uint finishMonth = timeHelpers.timestampToMonth(
            timeHelpers.addMonths(planHolder.startVestingTime, planParams.fullPeriod)
        );
        // uint afterLockupMonth = timeHelpers.timestampToMonth(timeHelpers.addMonths(
        //     planHolder.startVestingTime,
        //     planParams.lockupPeriod
        // ));
        return finishMonth.div(planParams.regularPaymentTime);
    }

    function _getPartPayment(
        address wallet,
        uint fullAmount,
        uint afterLockupPeriodAmount
    )
        internal
        view
        returns(uint)
    {
        return fullAmount.div(_getNumberOfAllPayments(wallet));
    }
}