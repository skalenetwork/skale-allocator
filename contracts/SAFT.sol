// SPDX-License-Identifier: AGPL-3.0-only

/*
    SAFT.sol - SKALE Manager
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
import "./interfaces/delegation//ITokenLaunchManager.sol";
import "./Permissions.sol";


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
    // mapping (address => address) private _holderToEscrow;

    modifier onlyOwnerAndActivateSeller() {
        ITokenLaunchManager tokenLaunchManager = ITokenLaunchManager(contractManager.getContract("TokenLaunchManager"));
        require(_isOwner() || tokenLaunchManager.hasRole(tokenLaunchManager.SELLER_ROLE(), _msgSender()), "Not authorized");
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
        external override
        allow("SkaleToken")
        // solhint-disable-next-line no-empty-blocks
    {

    }

    function approveSAFTHolder() external {
        address holder = msg.sender;
        require(_vestingHolders[holder].registered, "SAFT is not registered");
        require(!_vestingHolders[holder].approved, "SAFT is already approved");
        _vestingHolders[holder].approved = true;
    }

    function startVesting(address holder) external onlyOwner {
        require(_vestingHolders[holder].registered, "SAFT is not registered");
        require(_vestingHolders[holder].approved, "SAFT is not approved");
        _vestingHolders[holder].active = true;
        require(
            IERC20(contractManager.getContract("SkaleToken")).transfer(
                holder,
                _vestingHolders[holder].fullAmount
            ),
            "Error of token sending"
        );
    }

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

    function connectHolderToPlan(
        address holder,
        uint saftRoundId,
        uint startVestingTime, //timestamp
        uint fullAmount,
        uint lockupAmount
    )
        external
        onlyOwnerAndActivateSeller
    {
        require(_saftRounds.length >= saftRoundId && saftRoundId > 0, "SAFT round does not exist");
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
        // if (connectHolderToEscrow) {
        //     _holderToEscrow[holder] = address(new VestingEscrow(address(contractManager), holder));
        // } else {
        //     _holderToEscrow[holder] = holder;
        // }
    }

    function getAndUpdateLockedAmount(address wallet) external override returns (uint) {
        if (! _vestingHolders[wallet].active) {
            return 0;
        }
        return getLockedAmount(wallet);
    }

    function getAndUpdateForbiddenForDelegationAmount(address) external override returns (uint) {
        // metwork_launch_timestamp
        return 0;
    }

    function getStartVestingTime(address holder) external view returns (uint) {
        return _vestingHolders[holder].startVestingTime;
    }

    function getFinishVestingTime(address holder) external view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        SaftHolder memory saftHolder = _vestingHolders[holder];
        SAFTRound memory saftParams = _saftRounds[saftHolder.saftRoundId - 1];
        return timeHelpers.addMonths(saftHolder.startVestingTime, saftParams.fullPeriod);
    }

    function getLockupPeriodInMonth(address holder) external view returns (uint) {
        return _saftRounds[_vestingHolders[holder].saftRoundId - 1].lockupPeriod;
    }

    function isActiveVestingTerm(address holder) external view returns (bool) {
        return _vestingHolders[holder].active;
    }

    function isApprovedSAFT(address holder) external view returns (bool) {
        return _vestingHolders[holder].approved;
    }

    function isSAFTRegistered(address holder) external view returns (bool) {
        return _vestingHolders[holder].registered;
    }

    function getFullAmount(address holder) external view returns (uint) {
        return _vestingHolders[holder].fullAmount;
    }

    function getLockupPeriodTimestamp(address holder) external view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        SaftHolder memory saftHolder = _vestingHolders[holder];
        SAFTRound memory saftParams = _saftRounds[saftHolder.saftRoundId - 1];
        return timeHelpers.addMonths(saftHolder.startVestingTime, saftParams.lockupPeriod);
    }

    function getTimeOfNextPayment(address holder) external view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        uint date = now;
        SaftHolder memory saftHolder = _vestingHolders[holder];
        SAFTRound memory saftParams = _saftRounds[saftHolder.saftRoundId - 1];
        uint lockupDate = timeHelpers.addMonths(saftHolder.startVestingTime, saftParams.lockupPeriod);
        if (date < lockupDate) {
            return lockupDate;
        }
        uint dateTime = _getTimePointInCorrectPeriod(date, saftParams.vestingPeriod);
        uint lockupTime = _getTimePointInCorrectPeriod(
            timeHelpers.addMonths(saftHolder.startVestingTime, saftParams.lockupPeriod),
            saftParams.vestingPeriod
        );
        uint finishTime = _getTimePointInCorrectPeriod(
            timeHelpers.addMonths(saftHolder.startVestingTime, saftParams.fullPeriod),
            saftParams.vestingPeriod
        );
        uint numberOfDonePayments = dateTime.sub(lockupTime).div(saftParams.regularPaymentTime);
        uint numberOfAllPayments = finishTime.sub(lockupTime).div(saftParams.regularPaymentTime);
        if (numberOfAllPayments <= numberOfDonePayments + 1) {
            return timeHelpers.addMonths(
                saftHolder.startVestingTime,
                saftParams.fullPeriod
            );
        }
        uint nextPayment = finishTime
            .sub(
                saftParams.regularPaymentTime.mul(numberOfAllPayments.sub(numberOfDonePayments + 1))
            );
        return _addMonthsAndTimePoint(lockupDate, nextPayment, saftParams.vestingPeriod);
    }

    function getSAFTRound(uint saftRoundId) external view returns (SAFTRound memory) {
        require(saftRoundId < _saftRounds.length, "SAFT Round does not exist");
        return _saftRounds[saftRoundId];
    }

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

    function getLockedAmount(address wallet) public view returns (uint) {
        return _vestingHolders[wallet].fullAmount - calculateAvailableAmount(wallet);
    }

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

    function _getNumberOfPayments(address wallet) internal view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        uint date = now;
        SaftHolder memory saftHolder = _vestingHolders[wallet];
        SAFTRound memory saftParams = _saftRounds[saftHolder.saftRoundId - 1];
        if (date < timeHelpers.addMonths(saftHolder.startVestingTime, saftParams.lockupPeriod)) {
            return 0;
        }
        uint dateTime = _getTimePointInCorrectPeriod(date, saftParams.vestingPeriod);
        uint lockupTime = _getTimePointInCorrectPeriod(
            timeHelpers.addMonths(saftHolder.startVestingTime, saftParams.lockupPeriod),
            saftParams.vestingPeriod
        );
        return dateTime.sub(lockupTime).div(saftParams.regularPaymentTime);
    }

    function _getNumberOfAllPayments(address wallet) internal view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        SaftHolder memory saftHolder = _vestingHolders[wallet];
        SAFTRound memory saftParams = _saftRounds[saftHolder.saftRoundId - 1];
        uint finishTime = _getTimePointInCorrectPeriod(
            timeHelpers.addMonths(saftHolder.startVestingTime, saftParams.fullPeriod),
            saftParams.vestingPeriod
        );
        uint afterLockupTime = _getTimePointInCorrectPeriod(
            timeHelpers.addMonths(saftHolder.startVestingTime, saftParams.lockupPeriod),
            saftParams.vestingPeriod
        );
        return finishTime.sub(afterLockupTime).div(saftParams.regularPaymentTime);
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
        return fullAmount.sub(afterLockupPeriodAmount).div(_getNumberOfAllPayments(wallet));
    }

    function _getTimePointInCorrectPeriod(uint timestamp, TimeLine vestingPeriod) private view returns (uint) {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        if (vestingPeriod == TimeLine.DAY) {
            return timeHelpers.timestampToDay(timestamp);
        } else if (vestingPeriod == TimeLine.MONTH) {
            return timeHelpers.timestampToMonth(timestamp);
        } else {
            return timeHelpers.timestampToYear(timestamp);
        }
    }

    function _addMonthsAndTimePoint(
        uint timestamp,
        uint timePoints,
        TimeLine vestingPeriod
    )
        private
        view
        returns (uint)
    {
        ITimeHelpers timeHelpers = ITimeHelpers(contractManager.getContract("TimeHelpers"));
        if (vestingPeriod == TimeLine.DAY) {
            return timeHelpers.addDays(timestamp, timePoints);
        } else if (vestingPeriod == TimeLine.MONTH) {
            return timeHelpers.addMonths(timestamp, timePoints);
        } else {
            return timeHelpers.addYears(timestamp, timePoints);
        }
    }
}