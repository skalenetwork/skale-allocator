import { ContractManagerInstance,
    SkaleTokenTesterInstance,
    AllocatorInstance,
    EscrowContract,
    EscrowInstance,
    DistributorMockContract,
    TimeHelpersTesterInstance} from "../types/truffle-contracts";

const Escrow: EscrowContract = artifacts.require("./Escrow");

import { calculateLockedAmount } from "./tools/vestingCalculation";
import { currentTime, getTimeAtDate, skipTimeToDate, skipTime } from "./tools/time";

import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import chaiAlmost from "chai-almost";
import { deployContractManager } from "./tools/deploy/contractManager";
import { deployAllocator } from "./tools/deploy/allocator";
import { deploySkaleTokenTester } from "./tools/deploy/test/skaleTokenTester";
import { BeneficiaryStatus, TimeUnit } from "./tools/types";
import { deployTimeHelpersTester } from "./tools/deploy/test/timeHelpersTester";
chai.should();
chai.use(chaiAsPromised);
chai.use(chaiAlmost());

contract("Allocator", ([owner, vestingManager, beneficiary, beneficiary1, beneficiary2, beneficiary3, hacker]) => {
    let contractManager: ContractManagerInstance;
    let skaleToken: SkaleTokenTesterInstance;
    let allocator: AllocatorInstance;
    let timeHelpers: TimeHelpersTesterInstance;

    beforeEach(async () => {
        contractManager = await deployContractManager(owner);

        skaleToken = await deploySkaleTokenTester(contractManager);
        allocator = await deployAllocator(contractManager);
        timeHelpers = await deployTimeHelpersTester(contractManager);

        // each test will start from July 1
        await skipTimeToDate(web3, 1, 6);
        await skaleToken.mint(allocator.address, 1e9, "0x", "0x");
        await allocator.grantRole(await allocator.VESTING_MANAGER_ROLE(), vestingManager);
    });

    it("should register beneficiary", async () => {
        (await allocator.isBeneficiaryRegistered(beneficiary)).should.be.eq(false);
        await allocator.addPlan(6, 36, TimeUnit.MONTH, 6, false, true, {from: vestingManager});
        const startMonth = 6; // July 2020
        await allocator.connectBeneficiaryToPlan(beneficiary, 1, startMonth, 1e6, 1e5, {from: vestingManager});
        (await allocator.isBeneficiaryRegistered(beneficiary)).should.be.eq(true);
        (await allocator.isVestingActive(beneficiary)).should.be.eq(false);
    });

    it("should get beneficiary data", async () => {
        (await allocator.isBeneficiaryRegistered(beneficiary)).should.be.eq(false);
        await allocator.addPlan(6, 36, TimeUnit.MONTH, 6, false, true, {from: vestingManager});
        const startMonth = 6; // July 2020
        await allocator.connectBeneficiaryToPlan(
            beneficiary,
            1,
            startMonth,
            1e6,
            1e5,
            {from: vestingManager}
        );
        (await allocator.isBeneficiaryRegistered(beneficiary)).should.be.eq(true);
        ((await allocator.getStartMonth(beneficiary)).toNumber()).should.be.equal(startMonth);
        ((await allocator.getVestingCliffInMonth(beneficiary)).toNumber()).should.be.equal(6);
        ((await allocator.getLockupPeriodEndTimestamp(beneficiary)).toNumber()).should.be.equal(getTimeAtDate(1, 0, 2021));
        (await allocator.isDelegationAllowed(beneficiary)).should.be.equal(false);
        ((await allocator.getFinishVestingTime(beneficiary)).toNumber()).should.be.equal(getTimeAtDate(1, 6, 2023));
        const plan = await allocator.getPlan(1);
        plan.totalVestingDuration.should.be.equal('36');
        plan.vestingCliff.should.be.equal('6');
        plan.vestingIntervalTimeUnit.should.be.equal(TimeUnit.MONTH.toString());
        plan.vestingInterval.should.be.equal('6');
        plan.isDelegationAllowed.should.be.equal(false);
        const beneficiaryParams = await allocator.getBeneficiaryPlanParams(beneficiary);
        web3.utils.toBN(beneficiaryParams.status).toNumber().should.be.equal(BeneficiaryStatus.CONFIRMATION_PENDING);
        beneficiaryParams.planId.should.be.equal('1');
        beneficiaryParams.startMonth.should.be.equal(startMonth.toString());
        beneficiaryParams.fullAmount.should.be.equal('1000000');
        beneficiaryParams.amountAfterLockup.should.be.equal('100000');
    });

    it("should not start vesting without registering beneficiary", async () => {
        (await allocator.isBeneficiaryRegistered(beneficiary)).should.be.eq(false);
        await allocator.startVesting(beneficiary, {from: vestingManager}).should.be.eventually.rejectedWith("Beneficiary has inappropriate status");
        (await allocator.isBeneficiaryRegistered(beneficiary)).should.be.eq(false);
        (await allocator.isVestingActive(beneficiary)).should.be.eq(false);
    });

    it("should start vesting with registered & approved beneficiary", async () => {
        (await allocator.isBeneficiaryRegistered(beneficiary)).should.be.eq(false);
        await allocator.addPlan(6, 36, TimeUnit.MONTH, 6, false, true, {from: vestingManager});
        const startMonth = 6; // July 2020
        await allocator.connectBeneficiaryToPlan(beneficiary, 1, startMonth, 1e6, 1e5, {from: vestingManager});
        (await allocator.isBeneficiaryRegistered(beneficiary)).should.be.eq(true);
        (await allocator.isVestingActive(beneficiary)).should.be.eq(false);
        await allocator.startVesting(beneficiary, {from: vestingManager});
        (await allocator.isVestingActive(beneficiary)).should.be.eq(true);
    });

    it("should stop cancelable vesting after start", async () => {
        await allocator.isBeneficiaryRegistered(beneficiary).should.be.eventually.false;

        await allocator.addPlan(6, 36, TimeUnit.MONTH, 6, false, true, {from: vestingManager});

        const currentTimestamp = await currentTime(web3);
        const month = 31 * 24 * 60 * 60;
        const vestingStartTimestamp = currentTimestamp + month;
        const vestingStartMonth = await timeHelpers.timestampToMonth(vestingStartTimestamp);
        const totalTokens = 1e6;
        const tokensAfterLockup = 1e5;

        await allocator.connectBeneficiaryToPlan(beneficiary, 1, vestingStartMonth, totalTokens, tokensAfterLockup, {from: vestingManager});
        await allocator.isBeneficiaryRegistered(beneficiary).should.be.eventually.true;
        await allocator.isVestingActive(beneficiary).should.be.eventually.false;

        await allocator.startVesting(beneficiary, {from: vestingManager});
        await allocator.isVestingActive(beneficiary).should.be.eventually.true;

        skipTime(web3, vestingStartTimestamp + 12 * month - currentTimestamp);
        // 12 month after plan start
        // 6  month after lockup end
        const vested = Math.floor(tokensAfterLockup + (totalTokens - tokensAfterLockup) * 6 / 30);

        await allocator.stopVesting(beneficiary, {from: vestingManager});
        await allocator.isVestingActive(beneficiary).should.be.eventually.false;

        await allocator.startVesting(beneficiary, {from: vestingManager}).should.be.eventually.rejectedWith("Beneficiary has inappropriate status");
        await allocator.isVestingActive(beneficiary).should.be.eventually.false;

        const escrow: EscrowInstance = await Escrow.at(await allocator.getEscrowAddress(beneficiary));

        (await skaleToken.balanceOf(beneficiary)).toNumber()
            .should.be.equal(0);
        await escrow.retrieve({from: beneficiary});
        (await skaleToken.balanceOf(beneficiary)).toNumber()
            .should.be.equal(vested);

        await escrow.retrieveAfterTermination(vestingManager, {from: vestingManager});
        (await skaleToken.balanceOf(escrow.address)).toNumber()
            .should.be.equal(0);
        (await skaleToken.balanceOf(vestingManager)).toNumber()
            .should.be.equal(totalTokens - vested);
    });

    it("should not stop uncancelable vesting after start", async () => {
        await allocator.isBeneficiaryRegistered(beneficiary).should.be.eventually.false;

        await allocator.addPlan(6, 36, TimeUnit.MONTH, 6, false, false, {from: vestingManager});

        const currentTimestamp = await currentTime(web3);
        const month = 31 * 24 * 60 * 60;
        const vestingStartTimestamp = currentTimestamp + month;
        const vestingStartMonth = await timeHelpers.timestampToMonth(vestingStartTimestamp);
        const totalTokens = 1e6;
        const tokensAfterLockup = 1e5;

        await allocator.connectBeneficiaryToPlan(beneficiary, 1, vestingStartMonth, totalTokens, tokensAfterLockup, {from: vestingManager});
        await allocator.isBeneficiaryRegistered(beneficiary).should.be.eventually.true;
        await allocator.isVestingActive(beneficiary).should.be.eventually.false;

        await allocator.startVesting(beneficiary, {from: vestingManager});
        await allocator.isVestingActive(beneficiary).should.be.eventually.true;

        skipTime(web3, vestingStartTimestamp + 12 * month - currentTimestamp);
        // 12 month after plan start
        // 6  month after lockup end
        const vested = Math.floor(tokensAfterLockup + (totalTokens - tokensAfterLockup) * 6 / 30);

        await allocator.stopVesting(beneficiary, {from: vestingManager})
            .should.be.eventually.rejectedWith("Can't stop vesting for beneficiary with this plan");
        await allocator.isVestingActive(beneficiary).should.be.eventually.true;

        await allocator.startVesting(beneficiary, {from: vestingManager}).should.be.eventually.rejectedWith("Beneficiary has inappropriate status");
        await allocator.isVestingActive(beneficiary).should.be.eventually.true;

        const escrow: EscrowInstance = await Escrow.at(await allocator.getEscrowAddress(beneficiary));

        (await skaleToken.balanceOf(beneficiary)).toNumber()
            .should.be.equal(0);
        await escrow.retrieve({from: beneficiary});
        (await skaleToken.balanceOf(beneficiary)).toNumber()
            .should.be.equal(vested);

        await escrow.retrieveAfterTermination(vestingManager, {from: vestingManager})
            .should.be.eventually.rejectedWith("Vesting is active");
        (await skaleToken.balanceOf(escrow.address)).toNumber()
            .should.be.equal(1e6 - vested);
    });

    it("should not register Plan if sender is not a vesting manager", async () => {
        await allocator.addPlan(6, 36, TimeUnit.MONTH, 6, false, true, {from: hacker}).should.be.eventually.rejectedWith("Message sender is not a vesting manager");
    });

    it("should not connect beneficiary to Plan  if sender is not a vesting manager", async () => {
        await allocator.addPlan(6, 36, TimeUnit.MONTH, 6, false, true, {from: vestingManager});
        const startMonth = 6; // July 2020
        await allocator.connectBeneficiaryToPlan(beneficiary, 1, startMonth, 1e6, 1e5, {from: hacker}).should.be.eventually.rejectedWith("Message sender is not a vesting manager");
    });

    it("should not register already registered beneficiary", async () => {
        await allocator.addPlan(6, 36, TimeUnit.MONTH, 6, false, true, {from: vestingManager});
        const startMonth = 6; // July 2020
        await allocator.connectBeneficiaryToPlan(beneficiary, 1, startMonth, 1e6, 1e5, {from: vestingManager});
        await allocator.connectBeneficiaryToPlan(beneficiary, 1, startMonth, 1e6, 1e5, {from: vestingManager}).should.be.eventually.rejectedWith("Beneficiary is already added");
        await allocator.addPlan(6, 36, TimeUnit.MONTH, 6, false, true, {from: vestingManager});
        await allocator.connectBeneficiaryToPlan(beneficiary, 2, startMonth, 1e6, 1e5, {from: vestingManager}).should.be.eventually.rejectedWith("Beneficiary is already added");
    });

    it("should not register Plan if cliff is too big", async () => {
        await allocator.addPlan(37, 36, TimeUnit.MONTH, 6, false, true, {from: vestingManager}).should.be.eventually.rejectedWith("Cliff period exceeds total vesting duration");
    });

    it("should not register Plan if vesting interval is incorrect", async () => {
        await allocator.addPlan(6, 36, TimeUnit.MONTH, 7, false, true, {from: vestingManager}).should.be.eventually.rejectedWith("Vesting duration can't be divided into equal intervals");
    });

    it("should not connect beneficiary to Plan if amounts incorrect", async () => {
        await allocator.addPlan(6, 36, TimeUnit.MONTH, 6, false, true, {from: vestingManager});
        const startMonth = 6; // July 2020
        await allocator.connectBeneficiaryToPlan(beneficiary, 1, startMonth, 1e5, 1e6, {from: vestingManager}).should.be.eventually.rejectedWith("Incorrect amounts");
    });

    it("should be possible to delegate tokens in escrow if allowed", async () => {
        await allocator.addPlan(6, 36, TimeUnit.MONTH, 6, true, true, {from: vestingManager});
        await allocator.connectBeneficiaryToPlan(beneficiary, 1, await timeHelpers.timestampToMonth(getTimeAtDate(1, 6, 2020)), 1e6, 1e5, {from: vestingManager})
        await allocator.startVesting(beneficiary, {from: vestingManager});
        const escrowAddress = await allocator.getEscrowAddress(beneficiary);
        (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(1e6);
        const escrow = await Escrow.at(escrowAddress);
        const amount = 15000;
        const delegationPeriod = 3;
        await escrow.delegate(
            1, amount, delegationPeriod, "D2 is even", {from: beneficiary});
        (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(1e6);
        (await skaleToken.getAndUpdateLockedAmount.call(escrowAddress)).toNumber().should.be.equal(amount);
    });

    describe("when beneficiary delegate escrow tokens", async () => {
        let delegationId: number;
        let escrow: EscrowInstance;
        const delegatedAmount = 15000;

        beforeEach(async () => {
            await allocator.addPlan(6, 36, TimeUnit.MONTH, 6, true, true, {from: vestingManager});
            const startMonth = 6; // July 2020
            await allocator.connectBeneficiaryToPlan(beneficiary, 1, startMonth, 1e6, 1e5, {from: vestingManager})
            await allocator.startVesting(beneficiary, {from: vestingManager});
            const escrowAddress = await allocator.getEscrowAddress(beneficiary);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(1e6);
            escrow = (await Escrow.at(escrowAddress)) as EscrowInstance;
            const delegationPeriod = 3;
            await escrow.delegate(
                1, delegatedAmount, delegationPeriod, "D2 is even", {from: beneficiary});
            delegationId = 0;
        });

        it("should be able to undelegate escrow tokens", async () => {
            await escrow.requestUndelegation(delegationId, {from: beneficiary});
            (await skaleToken.getAndUpdateLockedAmount.call(escrow.address)).toNumber().should.be.equal(0);
        });

        it("should allow to withdraw bounties", async () => {
            const DistributorMock: DistributorMockContract = artifacts.require("./DistributorMock.sol");
            const distributor = await DistributorMock.new(skaleToken.address);
            await contractManager.setContractsAddress("Distributor", distributor.address);

            const bounty = 5;
            const validatorId = 0;
            await skaleToken.mint(owner, bounty, "0x", "0x");
            await skaleToken.send(
                distributor.address,
                bounty,
                web3.eth.abi.encodeParameters(
                    ["uint256", "address"],
                    [validatorId, escrow.address]
                )
            );
            await escrow.withdrawBounty(validatorId, beneficiary, {from: beneficiary});
            (await skaleToken.balanceOf(beneficiary)).toNumber().should.be.equal(bounty);
        });
    });

    it("should allow to retrieve all tokens if beneficiary is registered along time ago", async () => {
        const lockupPeriod = 6;
        const totalVestingDuration = 15;
        const fullAmount = 4e6;
        const lockupAmount = 1e6;
        const vestingIntervalTimeUnit = TimeUnit.MONTH;
        const vestingInterval = 3;
        const startMonth = (await timeHelpers.timestampToMonth(getTimeAtDate(1, 1, 2020))).toNumber();
        const isDelegationAllowed = false;
        const plan = 1;

        await allocator.addPlan(lockupPeriod, totalVestingDuration, vestingIntervalTimeUnit, vestingInterval, isDelegationAllowed, true, {from: vestingManager});
        await allocator.connectBeneficiaryToPlan(beneficiary, plan, startMonth, fullAmount, lockupAmount, {from: vestingManager});
        await allocator.startVesting(beneficiary, {from: vestingManager});
        const escrowAddress = await allocator.getEscrowAddress(beneficiary);
        const escrow = await Escrow.at(escrowAddress);
        (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount);

        const month = 31 * 24 * 60 * 60;
        const year = 12 * month;
        skipTime(web3, 100 * year);

        await escrow.retrieve({from: beneficiary});
        (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(0);
        (await skaleToken.balanceOf(beneficiary)).toNumber().should.be.equal(fullAmount);
    });

    it("should operate with fractional payments", async () => {
        const lockupPeriod = 1;
        const totalVestingDuration = 4;
        const fullAmount = 2e6;
        const lockupAmount = 1e6;
        const vestingIntervalTimeUnit = TimeUnit.MONTH;
        const vestingInterval = 1;
        const startMonth = (await timeHelpers.getCurrentMonth()).toNumber();
        const startTimestamp = (await timeHelpers.monthToTimestamp(startMonth)).toNumber();
        const isDelegationAllowed = false;
        const plan = 1;
        await allocator.addPlan(lockupPeriod, totalVestingDuration, vestingIntervalTimeUnit, vestingInterval, isDelegationAllowed, true, {from: vestingManager});
        await allocator.connectBeneficiaryToPlan(beneficiary, plan, startMonth, fullAmount, lockupAmount, {from: vestingManager});
        await allocator.startVesting(beneficiary, {from: vestingManager});
        let lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 7);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedAmount.should.be.equal(fullAmount - lockupAmount);
        await skipTimeToDate(web3, 1, 8);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(Math.round(fullAmount - lockupAmount - (fullAmount - lockupAmount) / ((totalVestingDuration - lockupPeriod) / vestingInterval)));
        await skipTimeToDate(web3, 1, 9);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - lockupAmount - Math.trunc(2 * (fullAmount - lockupAmount) / ((totalVestingDuration - lockupPeriod) / vestingInterval)));
        await skipTimeToDate(web3, 1, 10);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(0);
    });

    it("should correctly operate Plan 4: one time payment", async () => {
        const lockupPeriod = 10;
        const totalVestingDuration = 10;
        const fullAmount = 2e6;
        const lockupAmount = 1e6;
        const vestingIntervalTimeUnit = TimeUnit.MONTH;
        const vestingInterval = 1;
        const startMonth = (await timeHelpers.getCurrentMonth()).toNumber();
        const startTimestamp = (await timeHelpers.monthToTimestamp(startMonth)).toNumber();
        const isDelegationAllowed = false;
        const plan = 1;
        await allocator.addPlan(lockupPeriod, totalVestingDuration, vestingIntervalTimeUnit, vestingInterval, isDelegationAllowed, true, {from: vestingManager});
        await allocator.connectBeneficiaryToPlan(beneficiary, plan, startMonth, fullAmount, lockupAmount, {from: vestingManager});
        await allocator.startVesting(beneficiary, {from: vestingManager});
        let lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 7);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 8);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 9);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 10);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 11);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 12);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 1);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 2);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 3);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 4);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(0);
    });

    it("should correctly operate Plan 5: each month payment", async () => {
        const lockupPeriod = 1;
        const totalVestingDuration = 10;
        const fullAmount = 2e6;
        const lockupAmount = 2e5;
        const vestingTimeUnit = TimeUnit.MONTH;
        const vestingInterval = 1;
        const startMonth = (await timeHelpers.getCurrentMonth()).toNumber();
        const startTimestamp = (await timeHelpers.monthToTimestamp(startMonth)).toNumber();
        const isDelegationAllowed = false;
        const plan = 1;
        const initDate = new Date(startTimestamp * 1000);
        await allocator.addPlan(lockupPeriod, totalVestingDuration, vestingTimeUnit, vestingInterval, isDelegationAllowed, true, {from: vestingManager});
        await allocator.connectBeneficiaryToPlan(beneficiary, plan, startMonth, fullAmount, lockupAmount, {from: vestingManager});
        await allocator.startVesting(beneficiary, {from: vestingManager});
        let lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedAmount.should.be.equal(fullAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 7);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(fullAmount - lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 8);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 2 * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 9);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 3 * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 10);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 4 * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 11);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 5 * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 12);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 6 * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 1);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 7 * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 2);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 8 * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 3);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 9 * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 4);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 10 * lockupAmount);
        lockedAmount.should.be.equal(0);
        await allocator.getTimeOfNextVest(beneficiary)
            .should.be.eventually.rejectedWith("Vesting is over");
    });

    it("should correctly operate Plan 5: each 1 day payment", async () => {
        const lockupPeriod = 1;
        const totalVestingDuration = 2;
        const fullAmount = 2e6;
        const lockupAmount = 2e5;
        const vestingIntervalTimeUnit = TimeUnit.DAY;
        const vestingInterval = 1;
        const startMonth = (await timeHelpers.getCurrentMonth()).toNumber();
        const startTimestamp = (await timeHelpers.monthToTimestamp(startMonth)).toNumber();
        const isDelegationAllowed = false;
        const plan = 1;
        const initDate = new Date(startTimestamp * 1000);
        await allocator.addPlan(lockupPeriod, totalVestingDuration, vestingIntervalTimeUnit, vestingInterval, isDelegationAllowed, true, {from: vestingManager});
        await allocator.connectBeneficiaryToPlan(beneficiary, plan, startMonth, fullAmount, lockupAmount, {from: vestingManager});
        await allocator.startVesting(beneficiary, {from: vestingManager});
        let lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedAmount.should.be.equal(fullAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 7);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(fullAmount - lockupAmount);
        initDate.setUTCDate(initDate.getUTCDate() + vestingInterval);
        (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        for (let day = 2; day < 11; day++) {
            await skipTimeToDate(web3, day, 7);
            lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            initDate.setUTCDate(initDate.getUTCDate() + vestingInterval);
            (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        }

        initDate.setUTCMonth(initDate.getUTCMonth() + 1, 1);
        // finish day
        await skipTimeToDate(web3, 1, 8);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(0);
        await allocator.getTimeOfNextVest(beneficiary)
            .should.be.eventually.rejectedWith("Vesting is over");
    });

    it("should correctly operate Plan 5: each 1 year payment", async () => {
        const lockupPeriod = 12;
        const totalVestingDuration = 36;
        const fullAmount = 3e6;
        const lockupAmount = 1e6;
        const vestingIntervalTimeUnit = TimeUnit.YEAR;
        const vestingInterval = 1;
        const startMonth = (await timeHelpers.getCurrentMonth()).toNumber();
        const startTimestamp = (await timeHelpers.monthToTimestamp(startMonth)).toNumber();
        const isDelegationAllowed = false;
        const plan = 1;
        const initDate = new Date(startTimestamp * 1000);
        await allocator.addPlan(lockupPeriod, totalVestingDuration, vestingIntervalTimeUnit, vestingInterval, isDelegationAllowed, true, {from: vestingManager});
        await allocator.connectBeneficiaryToPlan(beneficiary, plan, startMonth, fullAmount, lockupAmount, {from: vestingManager});
        await allocator.startVesting(beneficiary, {from: vestingManager});
        let lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedAmount.should.be.equal(fullAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + vestingInterval);
        (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 5);
        await skipTimeToDate(web3, 1, 6);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(fullAmount - lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + vestingInterval);
        (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 5);
        await skipTimeToDate(web3, 1, 6);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 2 * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + vestingInterval);
        (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 5);
        await skipTimeToDate(web3, 1, 6);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 3 * lockupAmount);
        lockedAmount.should.be.equal(0);
        await allocator.getTimeOfNextVest(beneficiary)
            .should.be.eventually.rejectedWith("Vesting is over");
    });

    it("should correctly operate Plan 6: each day payment for 3 month", async () => {
        const lockupPeriod = 12;
        const totalVestingDuration = 15;
        const fullAmount = 2e6;
        const lockupAmount = 650000;
        const vestingIntervalTimeUnit = TimeUnit.DAY;
        const vestingInterval = 1;
        const startMonth = (await timeHelpers.getCurrentMonth()).toNumber();
        const startTimestamp = (await timeHelpers.monthToTimestamp(startMonth)).toNumber();
        const isDelegationAllowed = false;
        const plan = 1;
        const initDate = new Date(startTimestamp * 1000);
        await allocator.addPlan(lockupPeriod, totalVestingDuration, vestingIntervalTimeUnit, vestingInterval, isDelegationAllowed, true, {from: owner});
        await allocator.connectBeneficiaryToPlan(beneficiary, plan, startMonth, fullAmount, lockupAmount, {from: owner});
        await allocator.startVesting(beneficiary, {from: owner});

        await skipTimeToDate(web3, 1, 5); // 01.05.2022
        let lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedAmount.should.be.equal(fullAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + lockupPeriod) / 12, (initDate.getUTCMonth() + lockupPeriod) % 12);
        (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());

        await skipTimeToDate(web3, 1, 6); // 01.06.2022
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedAmount.should.be.equal(fullAmount - lockupAmount);
        initDate.setUTCDate(initDate.getUTCDate() + vestingInterval);
        (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());

        for (let i = 2; i <= 92; i++) {
            await skipTimeToDate(web3, i, 6);
            lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
            const lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            initDate.setUTCDate(initDate.getUTCDate() + vestingInterval);
            (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        }
    });


    it("should correctly operate Plan 7: twice payment", async () => {
        const lockupPeriod = 9;
        const totalVestingDuration = 15;
        const fullAmount = 2e6;
        const lockupAmount = 1e6;
        const vestingIntervalTimeUnit = TimeUnit.MONTH;
        const vestingInterval = 6;
        const startMonth = (await timeHelpers.getCurrentMonth()).toNumber();
        const startTimestamp = (await timeHelpers.monthToTimestamp(startMonth)).toNumber();
        const isDelegationAllowed = false;
        const plan = 1;
        const initDate = new Date(startTimestamp * 1000);
        await allocator.addPlan(lockupPeriod, totalVestingDuration, vestingIntervalTimeUnit, vestingInterval, isDelegationAllowed, true, {from: owner});
        await allocator.connectBeneficiaryToPlan(beneficiary, plan, startMonth, fullAmount, lockupAmount, {from: owner});
        await allocator.startVesting(beneficiary, {from: owner});

        await skipTimeToDate(web3, 1, 2);
        let lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedAmount.should.be.equal(fullAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + lockupPeriod) / 12, (initDate.getUTCMonth() + lockupPeriod) % 12);
        (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());

        await skipTimeToDate(web3, 1, 3);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedAmount.should.be.equal(fullAmount / 2);
        initDate.setUTCMonth(initDate.getUTCMonth() + vestingInterval);
        (await allocator.getTimeOfNextVest(beneficiary)).toString().should.be.equal((initDate.getTime() / 1000).toString());

        await skipTimeToDate(web3, 1, 9);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
        lockedAmount.should.be.equal(0);
        initDate.setUTCMonth(initDate.getUTCMonth() + vestingInterval);
        await allocator.getTimeOfNextVest(beneficiary).should.be.eventually.rejectedWith("Vesting is over");

    });

    it("should not add plan with zero vesting duration", async () => {
        const lockupPeriod = 0;
        const totalVestingDuration = 0;
        const fullAmount = 2e6;
        const lockupAmount = 2e6;
        const vestingIntervalTimeUnit = TimeUnit.MONTH;
        const vestingInterval = 0;
        const startMonth = (await timeHelpers.getCurrentMonth()).toNumber();
        const startTimestamp = (await timeHelpers.monthToTimestamp(startMonth)).toNumber();
        const isDelegationAllowed = false;
        const plan = 1;
        await allocator.addPlan(lockupPeriod, totalVestingDuration, vestingIntervalTimeUnit, vestingInterval, isDelegationAllowed, true, {from: vestingManager})
            .should.be.eventually.rejectedWith("Vesting duration can't be zero");
    });

    describe("when Plans are registered at the past", async () => {
        const lockupPeriod = 6;
        const totalVestingDuration = 36;
        const fullAmount = 6e6;
        const lockupAmount = 1e6;
        const vestingInterval = 6;
        const vestingIntervalTimeUnit = TimeUnit.MONTH;
        const isDelegationAllowed = false;

        let startMonth: number;
        let startTimestamp: number;

        beforeEach(async () => {
            const time = await currentTime(web3);
            const currentDate = new Date(time * 1000);
            const previousYear = currentDate.getFullYear() - 1;
            startMonth = (await timeHelpers.timestampToMonth(getTimeAtDate(1, 9, previousYear))).toNumber();
            startTimestamp = (await timeHelpers.monthToTimestamp(startMonth)).toNumber();
            // Plan example 0
            const plan = 1;
            await allocator.addPlan(lockupPeriod, totalVestingDuration, vestingIntervalTimeUnit, vestingInterval, isDelegationAllowed, true, {from: vestingManager});
            await allocator.connectBeneficiaryToPlan(beneficiary, plan, startMonth, fullAmount, lockupAmount, {from: vestingManager});
            await allocator.startVesting(beneficiary, {from: vestingManager});
        });

        it("should unlock tokens after lockup", async () => {
            const lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
            const lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
            // Plan 0 lockup amount unlocked
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(fullAmount - lockupAmount);
        });

        it("should be able to transfer token", async () => {
            const escrowAddress = await allocator.getEscrowAddress(beneficiary);
            const escrow = await Escrow.at(escrowAddress);
            await escrow.retrieve({from: beneficiary});
            (await skaleToken.balanceOf(beneficiary)).toNumber().should.be.equal(lockupAmount);
            await skaleToken.transfer(beneficiary1, "100", {from: beneficiary});
            (await skaleToken.balanceOf(beneficiary)).toNumber().should.be.equal(lockupAmount - 100);
            (await skaleToken.balanceOf(beneficiary1)).toNumber().should.be.equal(100);
        });

        it("should not be able to transfer more than unlocked", async () => {
            const escrowAddress = await allocator.getEscrowAddress(beneficiary);
            const escrow = await Escrow.at(escrowAddress);
            await escrow.retrieve({from: beneficiary});
            (await skaleToken.balanceOf(beneficiary)).toNumber().should.be.equal(lockupAmount);
            await skaleToken.transfer(beneficiary1, "1000001", {from: beneficiary}).should.be.eventually.rejectedWith("ERC777: transfer amount exceeds balance");
        });

        it("should unlock tokens first part after lockup", async () => {
            await skipTimeToDate(web3, 1, 9)
            const lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
            const lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.lessThan(fullAmount - lockupAmount);
        });
    });

    describe("when all beneficiaries are registered", async () => {
        const lockupPeriod = 6;
        const totalVestingDuration = 36;
        const fullAmount = 6e6;
        const lockupAmount = 1e6;
        const vestingInterval = 6;
        const vestingTimeUnit = TimeUnit.MONTH;
        const isDelegationAllowed = false;
        const planId = 1;

        const lockupPeriod1 = 12;
        const totalVestingDuration1 = 15;
        const fullAmount1 = 1e6;
        const lockupAmount1 = 5e5;
        const vestingInterval1 = 3;
        const vestingIntervalTimeUnit1 = TimeUnit.MONTH;
        const isDelegationAllowed1 = false;
        const planId1 = 2;

        const lockupPeriod2 = 9;
        const totalVestingDuration2 = 15;
        const fullAmount2 = 1e6;
        const lockupAmount2 = 5e5;
        const vestingInterval2 = 6;
        const vestingIntervalTimeUnit2 = TimeUnit.MONTH;
        const isDelegationAllowed2 = false;
        const planId2 = 3;

        const lockupPeriod3 = 12;
        const totalVestingDuration3 = 36;
        const fullAmount3 = 36e6;
        const lockupAmount3 = 12e6;
        const vestingInterval3 = 1;
        const vestingIntervalTimeUnit3 = TimeUnit.MONTH;
        const isDelegationAllowed3 = false;
        const planId3 = 4;

        let startMonth: number;
        let startTimestamp: number;

        beforeEach(async () => {
            startMonth = (await timeHelpers.getCurrentMonth()).toNumber();
            startTimestamp = (await timeHelpers.monthToTimestamp(startMonth)).toNumber();
            // Plan example 0
            await allocator.addPlan(lockupPeriod, totalVestingDuration, vestingTimeUnit, vestingInterval, isDelegationAllowed, true, {from: vestingManager});
            await allocator.connectBeneficiaryToPlan(beneficiary, planId, startMonth, fullAmount, lockupAmount, {from: vestingManager});
            await allocator.startVesting(beneficiary, {from: vestingManager});
            // Plan example 1
            await allocator.addPlan(lockupPeriod1, totalVestingDuration1, vestingIntervalTimeUnit1, vestingInterval1, isDelegationAllowed1, true, {from: vestingManager});
            await allocator.connectBeneficiaryToPlan(beneficiary1, planId1, startMonth, fullAmount1, lockupAmount1, {from: vestingManager});
            await allocator.startVesting(beneficiary1, {from: vestingManager});
            // Plan example 2
            await allocator.addPlan(lockupPeriod2, totalVestingDuration2, vestingIntervalTimeUnit2, vestingInterval2, isDelegationAllowed2, true, {from: vestingManager});
            await allocator.connectBeneficiaryToPlan(beneficiary2, planId2, startMonth, fullAmount2, lockupAmount2, {from: vestingManager});
            await allocator.startVesting(beneficiary2, {from: vestingManager});
            // Plan example 3
            await allocator.addPlan(lockupPeriod3, totalVestingDuration3, vestingIntervalTimeUnit3, vestingInterval3, isDelegationAllowed3, true, {from: vestingManager});
            await allocator.connectBeneficiaryToPlan(beneficiary3, planId3, startMonth, fullAmount3, lockupAmount3, {from: vestingManager});
            await allocator.startVesting(beneficiary3, {from: vestingManager});
        });

        it("should show balance of all escrows", async () => {
            let escrowAddress = await allocator.getEscrowAddress(beneficiary);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount);
            escrowAddress = await allocator.getEscrowAddress(beneficiary1);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount1);
            escrowAddress = await allocator.getEscrowAddress(beneficiary2);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount2);
            escrowAddress = await allocator.getEscrowAddress(beneficiary3);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount3);
        });

        it("All tokens should be locked of all beneficiaries", async () => {
            let lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
            lockedAmount.should.be.equal(fullAmount);

            lockedAmount = fullAmount1 - (await allocator.calculateVestedAmount(beneficiary1)).toNumber();
            lockedAmount.should.be.equal(fullAmount1);

            lockedAmount = fullAmount2 - (await allocator.calculateVestedAmount(beneficiary2)).toNumber();
            lockedAmount.should.be.equal(fullAmount2);

            lockedAmount = fullAmount3 - (await allocator.calculateVestedAmount(beneficiary3)).toNumber();
            lockedAmount.should.be.equal(fullAmount3);
        });

        it("After 6 month", async () => {
            // skip to Jan 1st
            await skipTimeToDate(web3, 1, 0);

            let lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
            const lockedCalculatedAmount = calculateLockedAmount(
                await currentTime(web3),
                startTimestamp,
                lockupPeriod,
                totalVestingDuration,
                fullAmount,
                lockupAmount,
                vestingTimeUnit,
                vestingInterval);
            // Beneficiary 0 lockup amount unlocked
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(fullAmount - lockupAmount);

            lockedAmount = fullAmount1 - (await allocator.calculateVestedAmount(beneficiary1)).toNumber();
            lockedAmount.should.be.equal(fullAmount1);

            lockedAmount = fullAmount2 - (await allocator.calculateVestedAmount(beneficiary2)).toNumber();
            lockedAmount.should.be.equal(fullAmount2);

            lockedAmount = fullAmount3 - (await allocator.calculateVestedAmount(beneficiary3)).toNumber();
            lockedAmount.should.be.equal(fullAmount3);
        });

        it("After 9 month", async () => {
            await skipTimeToDate(web3, 1, 3);
            let lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            // Beneficiary 0 only lockup amount unlocked
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(fullAmount - lockupAmount);

            lockedAmount = fullAmount1 - (await allocator.calculateVestedAmount(beneficiary1)).toNumber();
            lockedAmount.should.be.equal(fullAmount1);

            // Beneficiary 2 lockup amount unlocked
            lockedAmount = fullAmount2 - (await allocator.calculateVestedAmount(beneficiary2)).toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod2, totalVestingDuration2, fullAmount2, lockupAmount2, vestingIntervalTimeUnit2, vestingInterval2);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(fullAmount2 - lockupAmount2);

            lockedAmount = fullAmount3 - (await allocator.calculateVestedAmount(beneficiary3)).toNumber();
            lockedAmount.should.be.equal(fullAmount3);
        });

        it("After 12 month", async () => {
            await skipTimeToDate(web3, 1, 12);
            await skipTimeToDate(web3, 1, 6);

            let lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.lessThan(fullAmount - lockupAmount);

            // Plan 1 lockup amount unlocked
            lockedAmount = fullAmount1 - (await allocator.calculateVestedAmount(beneficiary1)).toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod1, totalVestingDuration1, fullAmount1, lockupAmount1, vestingIntervalTimeUnit1, vestingInterval1);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(fullAmount1 - lockupAmount1);

            // Plan 2 lockup amount unlocked
            lockedAmount = fullAmount2 - (await allocator.calculateVestedAmount(beneficiary2)).toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod2, totalVestingDuration2, fullAmount2, lockupAmount2, vestingIntervalTimeUnit2, vestingInterval2);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(fullAmount2 - lockupAmount2);

            // Plan 3 lockup amount unlocked
            lockedAmount = fullAmount3 - (await allocator.calculateVestedAmount(beneficiary3)).toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod3, totalVestingDuration3, fullAmount3, lockupAmount3, vestingIntervalTimeUnit3, vestingInterval3);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(fullAmount3 - lockupAmount3);
        });

        it("should be possible to send tokens", async () => {
            await skipTimeToDate(web3, 1, 12);
            await skipTimeToDate(web3, 1, 6);
            let escrowAddress = await allocator.getEscrowAddress(beneficiary);
            let escrow = await Escrow.at(escrowAddress);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount);
            await escrow.retrieve({from: beneficiary});
            escrowAddress = await allocator.getEscrowAddress(beneficiary1);
            escrow = await Escrow.at(escrowAddress);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount1);
            await escrow.retrieve({from: beneficiary1});
            escrowAddress = await allocator.getEscrowAddress(beneficiary2);
            escrow = await Escrow.at(escrowAddress);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount2);
            await escrow.retrieve({from: beneficiary2});
            escrowAddress = await allocator.getEscrowAddress(beneficiary3);
            escrow = await Escrow.at(escrowAddress);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount3);
            await escrow.retrieve({from: beneficiary3});
            await skaleToken.transfer(hacker, "100", {from: beneficiary});
            await skaleToken.transfer(hacker, "100", {from: beneficiary1});
            await skaleToken.transfer(hacker, "100", {from: beneficiary2});
            await skaleToken.transfer(hacker, "100", {from: beneficiary3});
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            (await skaleToken.balanceOf(beneficiary)).toNumber().should.be.equal(fullAmount - lockedCalculatedAmount - 100);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod1, totalVestingDuration1, fullAmount1, lockupAmount1, vestingIntervalTimeUnit1, vestingInterval1);
            (await skaleToken.balanceOf(beneficiary1)).toNumber().should.be.equal(fullAmount1 - lockedCalculatedAmount - 100);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod2, totalVestingDuration2, fullAmount2, lockupAmount2, vestingIntervalTimeUnit2, vestingInterval2);
            (await skaleToken.balanceOf(beneficiary2)).toNumber().should.be.equal(fullAmount2 - lockedCalculatedAmount - 100);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod3, totalVestingDuration3, fullAmount3, lockupAmount3, vestingIntervalTimeUnit3, vestingInterval3);
            (await skaleToken.balanceOf(beneficiary3)).toNumber().should.be.equal(fullAmount3 - lockedCalculatedAmount - 100);
            (await skaleToken.balanceOf(hacker)).toNumber().should.be.equal(400);
        });

        it("After 15 month", async () => {
            await skipTimeToDate(web3, 1, 3);
            await skipTimeToDate(web3, 1, 9);

            let lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.lessThan(fullAmount - lockupAmount);

            // Plan 1 unlocked all tokens
            lockedAmount = fullAmount1 - (await allocator.calculateVestedAmount(beneficiary1)).toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod1, totalVestingDuration1, fullAmount1, lockupAmount1, vestingIntervalTimeUnit1, vestingInterval1);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(0);

            // Plan 2 unlocked all tokens
            lockedAmount = fullAmount2 - (await allocator.calculateVestedAmount(beneficiary2)).toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod2, totalVestingDuration2, fullAmount2, lockupAmount2, vestingIntervalTimeUnit2, vestingInterval2);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(0);

            lockedAmount = fullAmount3 - (await allocator.calculateVestedAmount(beneficiary3)).toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod3, totalVestingDuration3, fullAmount3, lockupAmount3, vestingIntervalTimeUnit3, vestingInterval3);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.lessThan(fullAmount3 - lockupAmount3);
        });

        it("After 16, 17, 18 month", async () => {
            let plan0unlocked16: number;
            let plan0unlocked17: number;
            let plan0unlocked18: number;
            let plan3unlocked16: number;
            let plan3unlocked17: number;
            let plan3unlocked18: number;

            await skipTimeToDate(web3, 1, 5);
            await skipTimeToDate(web3, 1, 10);

            let lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
            plan0unlocked16 = lockedAmount;
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            lockedAmount = fullAmount3 - (await allocator.calculateVestedAmount(beneficiary3)).toNumber();
            plan3unlocked16 = lockedAmount;
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod3, totalVestingDuration3, fullAmount3, lockupAmount3, vestingIntervalTimeUnit3, vestingInterval3);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            await skipTimeToDate(web3, 1, 11);

            lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
            plan0unlocked17 = lockedAmount;
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            lockedAmount = fullAmount3 - (await allocator.calculateVestedAmount(beneficiary3)).toNumber();
            plan3unlocked17 = lockedAmount;
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod3, totalVestingDuration3, fullAmount3, lockupAmount3, vestingIntervalTimeUnit3, vestingInterval3);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            plan0unlocked16.should.be.equal(plan0unlocked17);

            await skipTimeToDate(web3, 1, 12);

            lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
            plan0unlocked18 = lockedAmount;
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            lockedAmount = fullAmount3 - (await allocator.calculateVestedAmount(beneficiary3)).toNumber();
            plan3unlocked18 = lockedAmount;
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod3, totalVestingDuration3, fullAmount3, lockupAmount3, vestingIntervalTimeUnit3, vestingInterval3);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            (plan3unlocked16 - plan3unlocked17).should.be.equal(plan3unlocked17 - plan3unlocked18);

            plan0unlocked18.should.be.lessThan(plan0unlocked17);
        });

        it("After 24, 30, 36 month", async () => {
            let plan0unlocked24: number;
            let plan0unlocked30: number;
            let plan0unlocked36: number;

            await skipTimeToDate(web3, 1, 5);
            await skipTimeToDate(web3, 1, 4);
            await skipTimeToDate(web3, 1, 6);

            let lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
            plan0unlocked24 = lockedAmount;
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            lockedAmount = fullAmount3 - (await allocator.calculateVestedAmount(beneficiary3)).toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod3, totalVestingDuration3, fullAmount3, lockupAmount3, vestingIntervalTimeUnit3, vestingInterval3);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            await skipTimeToDate(web3, 1, 12);

            lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
            plan0unlocked30 = lockedAmount;
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            lockedAmount = fullAmount3 - (await allocator.calculateVestedAmount(beneficiary3)).toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod3, totalVestingDuration3, fullAmount3, lockupAmount3, vestingIntervalTimeUnit3, vestingInterval3);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            await skipTimeToDate(web3, 1, 6);

            lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary)).toNumber();
            plan0unlocked36 = lockedAmount;
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(0);

            lockedAmount = fullAmount3 - (await allocator.calculateVestedAmount(beneficiary3)).toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startTimestamp, lockupPeriod3, totalVestingDuration3, fullAmount3, lockupAmount3, vestingIntervalTimeUnit3, vestingInterval3);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(0);

            (plan0unlocked24 - plan0unlocked30).should.be.equal(plan0unlocked30 - plan0unlocked36);
        });
    });

    describe("should calculate next vest time correctly", async () => {
        it("from Dec 30, year based vesting", async () => {
            await allocator.addPlan(0, 2 * 12, TimeUnit.YEAR, 1, false, false, {from: vestingManager});
            const plan = 1;

            const currentYear = new Date(await currentTime(web3) * 1000).getFullYear();
            const startDate = (new Date(currentYear + "-12-30T00:00:00.000+00:00")).getTime() / 1000; // Dec 30th
            const startMonth = await timeHelpers.timestampToMonth(startDate.toString(10)); // Dec

            // start from Dec
            await allocator.connectBeneficiaryToPlan(beneficiary, plan, startMonth, 5, 0, {from: vestingManager});

            // skip to Jan 1st
            await skipTimeToDate(web3, 1, 0);

            (await allocator.getTimeOfNextVest(beneficiary)).toNumber()
                .should.be.equal((new Date(currentYear + 1 + "-12-01T00:00:00.000+00:00")).getTime() / 1000);
        });

        it("from Dec 30, month based vesting", async () => {
            await allocator.addPlan(0, 2 * 12, TimeUnit.MONTH, 1, false, false, {from: vestingManager});
            const plan = 1;

            const currentYear = new Date(await currentTime(web3) * 1000).getFullYear();
            const startDate = (new Date(currentYear + "-12-30T00:00:00.000+00:00")).getTime() / 1000; // Dec 30th
            const startMonth = await timeHelpers.timestampToMonth(startDate.toString(10)); // Dec

            // start from Dec
            await allocator.connectBeneficiaryToPlan(beneficiary, plan, startMonth, 5, 0, {from: vestingManager});

            // skip to Jan 1st
            await skipTimeToDate(web3, 1, 0);

            (await allocator.getTimeOfNextVest(beneficiary)).toNumber()
                .should.be.equal((new Date(currentYear + 1 + "-02-01T00:00:00.000+00:00")).getTime() / 1000);
        });

        it("from Dec 30, day based vesting", async () => {
            await allocator.addPlan(0, 2 * 12, TimeUnit.DAY, 1, false, false, {from: vestingManager});
            const plan = 1;

            const currentYear = new Date(await currentTime(web3) * 1000).getFullYear();
            const startDate = (new Date(currentYear + "-12-30T00:00:00.000+00:00")).getTime() / 1000; // Dec 30th
            const startMonth = await timeHelpers.timestampToMonth(startDate.toString(10)); // Dec

            // start from Dec
            await allocator.connectBeneficiaryToPlan(beneficiary, plan, startMonth, 5, 0, {from: vestingManager});

            // skip to Jan 1st
            await skipTimeToDate(web3, 1, 0);

            (await allocator.getTimeOfNextVest(beneficiary)).toNumber()
                .should.be.equal((new Date(currentYear + 1 + "-01-02T00:00:00.000+00:00")).getTime() / 1000);
        });
    });
});
