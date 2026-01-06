import {
    ContractManager,
    SkaleTokenTester,
    Allocator,
    Escrow,
    TimeHelpersTester
} from "../typechain-types";

import { calculateLockedAmount } from "./tools/vestingCalculation";
import { currentTime, getTimeAtDate, skipTimeToDate, skipTime } from "./tools/time";

import * as chai from "chai";
import { deployContractManager } from "./tools/deploy/contractManager";
import { deployAllocator } from "./tools/deploy/allocator";
import { deploySkaleTokenTester } from "./tools/deploy/test/skaleTokenTester";
import { BeneficiaryStatus, TimeUnit } from "./tools/types";
import { deployTimeHelpersTester } from "./tools/deploy/test/timeHelpersTester";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, upgrades } from "hardhat";
import { expect } from "chai";

chai.should();

describe("Allocator", () => {
    let owner: SignerWithAddress;
    let vestingManager: SignerWithAddress;
    let beneficiary: SignerWithAddress;
    let beneficiary1: SignerWithAddress;
    let beneficiary2: SignerWithAddress;
    let beneficiary3: SignerWithAddress;
    let hacker: SignerWithAddress;

    let contractManager: ContractManager;
    let skaleToken: SkaleTokenTester;
    let allocator: Allocator;
    let timeHelpers: TimeHelpersTester;

    beforeEach(async () => {
        [owner, vestingManager, beneficiary, beneficiary1, beneficiary2, beneficiary3, hacker] = await ethers.getSigners();
        contractManager = await deployContractManager();

        skaleToken = await deploySkaleTokenTester(contractManager);
        allocator = await deployAllocator(contractManager);
        timeHelpers = await deployTimeHelpersTester(contractManager);

        // each test will start from July 1
        await skipTimeToDate(1, 6);
        await skaleToken.mint(allocator.target, 1e9, "0x", "0x");
        await allocator.grantRole(await allocator.VESTING_MANAGER_ROLE(), vestingManager.address);
    });

    it("should register beneficiary", async () => {
        (await allocator.isBeneficiaryRegistered(beneficiary.address)).should.be.eq(false);
        await allocator.connect(vestingManager).addPlan(6, 36, TimeUnit.MONTH, 6, false, true);
        const startMonth = 6; // July 2020
        await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, 1, startMonth, 1e6, 1e5);
        (await allocator.isBeneficiaryRegistered(beneficiary.address)).should.be.eq(true);
        (await allocator.isVestingActive(beneficiary.address)).should.be.eq(false);
    });

    it("should allow only owner to set a version", async () => {
        await expect(allocator.connect(hacker).setVersion("bad"))
            .to.be.revertedWithCustomError(allocator, "CallerNotOwner");

        await allocator.setVersion("good");
        (await allocator.version()).should.be.equal("good");
    });

    it("should get beneficiary data", async () => {
        (await allocator.isBeneficiaryRegistered(beneficiary.address)).should.be.eq(false);
        await allocator.connect(vestingManager).addPlan(6, 36, TimeUnit.MONTH, 6, false, true);
        const startMonth = 6; // July 2020
        await allocator.connect(vestingManager).connectBeneficiaryToPlan(
            beneficiary.address,
            1,
            startMonth,
            1e6,
            1e5
        );
        (await allocator.isBeneficiaryRegistered(beneficiary.address)).should.be.eq(true);
        ((await allocator.getStartMonth(beneficiary.address))).should.be.equal(startMonth);
        ((await allocator.getVestingCliffInMonth(beneficiary.address))).should.be.equal(6);
        ((await allocator.getLockupPeriodEndTimestamp(beneficiary.address))).should.be.equal(getTimeAtDate(1, 0, 2021));
        (await allocator.isDelegationAllowed(beneficiary.address)).should.be.equal(false);
        ((await allocator.getFinishVestingTime(beneficiary.address))).should.be.equal(getTimeAtDate(1, 6, 2023));
        const plan = await allocator.getPlan(1);
        (plan.totalVestingDuration).toString().should.be.equal('36');
        (plan.vestingCliff).toString().should.be.equal('6');
        (plan.vestingIntervalTimeUnit).toString().should.be.equal(TimeUnit.MONTH.toString());
        (plan.vestingInterval).toString().should.be.equal('6');
        plan.isDelegationAllowed.should.be.equal(false);
        const beneficiaryParams = await allocator.getBeneficiaryPlanParams(beneficiary.address);
        (beneficiaryParams.status).should.be.equal(BeneficiaryStatus.CONFIRMATION_PENDING);
        (beneficiaryParams.planId).toString().should.be.equal('1');
        (beneficiaryParams.startMonth).toString().should.be.equal(startMonth.toString());
        (beneficiaryParams.fullAmount).toString().should.be.equal('1000000');
        (beneficiaryParams.amountAfterLockup).toString().should.be.equal('100000');
    });

    it("should not start vesting without registering beneficiary", async () => {
        (await allocator.isBeneficiaryRegistered(beneficiary.address)).should.be.eq(false);
        await expect(allocator.connect(vestingManager).startVesting(beneficiary.address))
            .to.be.revertedWithCustomError(allocator, "BeneficiaryStatusInappropriate");
        (await allocator.isBeneficiaryRegistered(beneficiary.address)).should.be.eq(false);
        (await allocator.isVestingActive(beneficiary.address)).should.be.eq(false);
    });

    it("should start vesting with registered & approved beneficiary", async () => {
        (await allocator.isBeneficiaryRegistered(beneficiary.address)).should.be.eq(false);
        await allocator.connect(vestingManager).addPlan(6, 36, TimeUnit.MONTH, 6, false, true);
        const startMonth = 6; // July 2020
        await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, 1, startMonth, 1e6, 1e5);
        (await allocator.isBeneficiaryRegistered(beneficiary.address)).should.be.eq(true);
        (await allocator.isVestingActive(beneficiary.address)).should.be.eq(false);
        await allocator.connect(vestingManager).startVesting(beneficiary.address);
        (await allocator.isVestingActive(beneficiary.address)).should.be.eq(true);
    });

    it("should stop cancelable vesting after start", async () => {
        expect(await allocator.isBeneficiaryRegistered(beneficiary.address)).to.be.false;

        await allocator.connect(vestingManager).addPlan(6, 36, TimeUnit.MONTH, 6, false, true);

        const currentTimestamp = await currentTime();
        const month = 31 * 24 * 60 * 60;
        const vestingStartTimestamp = currentTimestamp + month;
        const vestingStartMonth = await timeHelpers.timestampToMonth(vestingStartTimestamp);
        const totalTokens = 1e6;
        const tokensAfterLockup = 1e5;

        await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, 1, vestingStartMonth, totalTokens, tokensAfterLockup);
        expect(await allocator.isBeneficiaryRegistered(beneficiary.address)).to.be.true;
        expect(await allocator.isVestingActive(beneficiary.address)).to.be.false;

        await allocator.connect(vestingManager).startVesting(beneficiary.address);
        expect(await allocator.isVestingActive(beneficiary.address)).to.be.true;

        await skipTime(vestingStartTimestamp + 12 * month - currentTimestamp);
        // 12 month after plan start
        // 6  month after lockup end
        const vested = Math.floor(tokensAfterLockup + (totalTokens - tokensAfterLockup) * 6 / 30);

        await allocator.connect(vestingManager).stopVesting(beneficiary.address);
        expect(await allocator.isVestingActive(beneficiary.address)).to.be.false;

        await expect(allocator.connect(vestingManager).startVesting(beneficiary.address))
            .to.be.revertedWithCustomError(allocator, "BeneficiaryStatusInappropriate");
        expect(await allocator.isVestingActive(beneficiary.address)).to.be.false;

        const escrowFactory = await ethers.getContractFactory("Escrow");
        const escrow = escrowFactory.attach(await allocator.getEscrowAddress(beneficiary.address));

        (await skaleToken.balanceOf(beneficiary.address))
            .should.be.equal(0n);
        await (escrow.connect(beneficiary) as unknown as Escrow).retrieve();
        (await skaleToken.balanceOf(beneficiary.address))
            .should.be.equal(vested);

        await (escrow.connect(vestingManager) as unknown as Escrow).retrieveAfterTermination(vestingManager.address);
        (await skaleToken.balanceOf(escrow.target))
            .should.be.equal(0n);
        (await skaleToken.balanceOf(vestingManager.address))
            .should.be.equal(totalTokens - vested);
    });

    it("should not stop uncancelable vesting after start", async () => {
        expect(await allocator.isBeneficiaryRegistered(beneficiary.address)).to.be.false;

        await allocator.connect(vestingManager).addPlan(6, 36, TimeUnit.MONTH, 6, false, false);

        const currentTimestamp = await currentTime();
        const month = 31 * 24 * 60 * 60;
        const vestingStartTimestamp = currentTimestamp + month;
        const vestingStartMonth = await timeHelpers.timestampToMonth(vestingStartTimestamp);
        const totalTokens = 1e6;
        const tokensAfterLockup = 1e5;

        await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, 1, vestingStartMonth, totalTokens, tokensAfterLockup);
        expect(await allocator.isBeneficiaryRegistered(beneficiary.address)).to.be.true;
        expect(await allocator.isVestingActive(beneficiary.address)).to.be.false;

        await allocator.connect(vestingManager).startVesting(beneficiary.address);
        expect(await allocator.isVestingActive(beneficiary.address)).to.be.true;

        await skipTime(vestingStartTimestamp + 12 * month - currentTimestamp);
        // 12 month after plan start
        // 6  month after lockup end
        const vested = Math.floor(tokensAfterLockup + (totalTokens - tokensAfterLockup) * 6 / 30);

        await expect(allocator.connect(vestingManager).stopVesting(beneficiary.address))
            .to.be.revertedWithCustomError(allocator, "PlanNotTerminatable");
        expect(await allocator.isVestingActive(beneficiary.address)).to.be.true;

        await expect(allocator.connect(vestingManager).startVesting(beneficiary.address))
            .to.be.revertedWithCustomError(allocator, "BeneficiaryStatusInappropriate");
        expect(await allocator.isVestingActive(beneficiary.address)).to.be.true;

        const escrowFactory = await ethers.getContractFactory("Escrow");
        const escrow = escrowFactory.attach(await allocator.getEscrowAddress(beneficiary.address));

        (await skaleToken.balanceOf(beneficiary.address))
            .should.be.equal(0n);
        await (escrow.connect(beneficiary) as unknown as Escrow).retrieve();
        (await skaleToken.balanceOf(beneficiary.address))
            .should.be.equal(vested);

        await expect((escrow.connect(vestingManager) as unknown as Escrow).retrieveAfterTermination(vestingManager.address))
            .to.be.revertedWithCustomError(escrow, "VestingIsActive");
        (await skaleToken.balanceOf(escrow.target))
            .should.be.equal(1e6 - vested);
    });

    it("should not register Plan if sender is not a vesting manager", async () => {
        await expect(allocator.connect(hacker).addPlan(6, 36, TimeUnit.MONTH, 6, false, true))
            .to.be.revertedWithCustomError(allocator, "CallerNotVestingManager");
    });

    it("should not connect beneficiary to Plan  if sender is not a vesting manager", async () => {
        await allocator.connect(vestingManager).addPlan(6, 36, TimeUnit.MONTH, 6, false, true);
        const startMonth = 6; // July 2020
        await expect(allocator.connect(hacker).connectBeneficiaryToPlan(beneficiary.address, 1, startMonth, 1e6, 1e5))
            .to.be.revertedWithCustomError(allocator, "CallerNotVestingManager");
    });

    it("should not register already registered beneficiary", async () => {
        await allocator.connect(vestingManager).addPlan(6, 36, TimeUnit.MONTH, 6, false, true);
        const startMonth = 6; // July 2020
        await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, 1, startMonth, 1e6, 1e5);
        await expect(allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, 1, startMonth, 1e6, 1e5))
            .to.be.revertedWithCustomError(allocator, "BeneficiaryAlreadyAdded");
        await allocator.connect(vestingManager).addPlan(6, 36, TimeUnit.MONTH, 6, false, true);
        await expect(allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, 2, startMonth, 1e6, 1e5))
            .to.be.revertedWithCustomError(allocator, "BeneficiaryAlreadyAdded");
    });

    it("should not register Plan if cliff is too big", async () => {
        await expect(allocator.connect(vestingManager).addPlan(37, 36, TimeUnit.MONTH, 6, false, true))
            .to.be.revertedWithCustomError(allocator, "CliffPeriodExceedsDuration");
    });

    it("should not register Plan if vesting interval is incorrect", async () => {
        await expect(allocator.connect(vestingManager).addPlan(6, 36, TimeUnit.MONTH, 7, false, true))
            .to.be.revertedWithCustomError(allocator, "VestingDurationNotDivisible");
    });

    it("should not connect beneficiary to Plan if amounts incorrect", async () => {
        await allocator.connect(vestingManager).addPlan(6, 36, TimeUnit.MONTH, 6, false, true);
        const startMonth = 6; // July 2020
        await expect(allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, 1, startMonth, 1e5, 1e6))
            .to.be.revertedWithCustomError(allocator, "IncorrectAmounts");
    });

    it("should be possible to delegate tokens in escrow if allowed", async () => {
        await allocator.connect(vestingManager).addPlan(6, 36, TimeUnit.MONTH, 6, true, true);
        await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, 1, await timeHelpers.timestampToMonth(getTimeAtDate(1, 6, 2020)), 1e6, 1e5)
        await allocator.connect(vestingManager).startVesting(beneficiary.address);
        const escrowAddress = await allocator.getEscrowAddress(beneficiary.address);
        (await skaleToken.balanceOf(escrowAddress)).should.be.equal(1000000n);
        const escrowFactory = await ethers.getContractFactory("Escrow");
        const escrow = escrowFactory.attach(escrowAddress);
        const amount = 15000;
        const delegationPeriod = 3;
        await (escrow.connect(beneficiary) as unknown as Escrow).delegate(
            1, amount, delegationPeriod, "D2 is even");
        (await skaleToken.balanceOf(escrowAddress)).should.be.equal(1000000n);
        (await skaleToken.getAndUpdateLockedAmount.staticCall(escrowAddress)).should.be.equal(amount);
    });

    describe("when beneficiary delegate escrow tokens", () => {
        let delegationId: number;
        let escrow: Escrow;
        const delegatedAmount = 15000n;
        const fullAmount = 1000000n;

        beforeEach(async () => {
            await allocator.connect(vestingManager).addPlan(6, 36, TimeUnit.MONTH, 6, true, true);
            const time = await currentTime();
            const currentDate = new Date(time * 1000);
            const previousYear = currentDate.getFullYear() - 1;
            const startMonth = 6 + 12 * (previousYear - 2020); // July of previous year
            await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, 1, startMonth, fullAmount, 1e5)
            await allocator.connect(vestingManager).startVesting(beneficiary.address);
            const escrowAddress = await allocator.getEscrowAddress(beneficiary.address);
            (await skaleToken.balanceOf(escrowAddress)).should.be.equal(fullAmount);
            const escrowFactory = await ethers.getContractFactory("Escrow");
            escrow = (escrowFactory.attach(escrowAddress) as unknown as Escrow);
            const delegationPeriod = 3;
            await (escrow.connect(beneficiary) as unknown as Escrow).delegate(
                1, delegatedAmount, delegationPeriod, "D2 is even");
            delegationId = 0;
        });

        it("should allow beneficiary to change address", async () => {
            await expect(allocator.connect(beneficiary).changeBeneficiaryAddress(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(allocator, "BeneficiaryAddressNull");
            await expect(allocator.connect(beneficiary).changeBeneficiaryAddress(beneficiary.address))
                .to.be.revertedWithCustomError(allocator, "BeneficiaryAddressNotClean");

            const oldBeneficiaryParams = await allocator.getBeneficiaryPlanParams(beneficiary.address);
            const oldBeneficiaryEscrow = await allocator.getEscrowAddress(beneficiary.address);
            await allocator.connect(beneficiary).changeBeneficiaryAddress(beneficiary1.address);

            await expect(allocator.connect(hacker).confirmBeneficiaryAddress(beneficiary.address))
                .to.be.revertedWithCustomError(allocator, "BeneficiaryChangeNotAllowed");

            const escrowFactory = await ethers.getContractFactory("Escrow");
            escrow = (escrowFactory.attach(oldBeneficiaryEscrow) as unknown as Escrow);
            await expect(allocator.connect(beneficiary1).confirmBeneficiaryAddress(beneficiary.address))
                .to.emit(escrow, 'BeneficiaryUpdated')
                .withArgs(beneficiary.address, beneficiary1.address);

            const newBeneficiaryParams = await allocator.getBeneficiaryPlanParams(beneficiary1.address);
            const newBeneficiaryEscrow = await allocator.getEscrowAddress(beneficiary1.address);

            newBeneficiaryParams.should.deep.equal(oldBeneficiaryParams);
            newBeneficiaryEscrow.should.be.equal(oldBeneficiaryEscrow);

            await expect(allocator.getBeneficiaryPlanParams(beneficiary.address))
                .to.be.revertedWithCustomError(allocator, "BeneficiaryNotRegistered");
            expect(await allocator.getEscrowAddress(beneficiary.address))
                .to.equal(ethers.ZeroAddress);
        });

        it("should be able to cancel pending delegation request", async () => {
            await (escrow.connect(beneficiary) as unknown as Escrow).cancelPendingDelegation(delegationId);
            (await skaleToken.getAndUpdateLockedAmount.staticCall(escrow.target)).should.be.equal(0n);
        });

        it("should be able to undelegate escrow tokens", async () => {
            await (escrow.connect(beneficiary) as unknown as Escrow).requestUndelegation(delegationId);
            (await skaleToken.getAndUpdateLockedAmount.staticCall(escrow.target)).should.be.equal(0n);
        });

        it("should allow to withdraw bounties", async () => {
            const distributerMockFactory = await ethers.getContractFactory("DistributorMock");
            const distributor = await distributerMockFactory.deploy(skaleToken.target);
            await contractManager.setContractsAddress("Distributor", distributor.target);

            const bounty = 5n;
            const validatorId = 0;
            await skaleToken.mint(owner.address, bounty, "0x", "0x");
            await skaleToken.send(
                distributor.target,
                bounty,
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["uint256", "address"],
                    [validatorId, escrow.target]
                )
            );
            await (escrow.connect(beneficiary) as unknown as Escrow).withdrawBounty(validatorId, beneficiary.address);
            (await skaleToken.balanceOf(beneficiary.address)).should.be.equal(bounty);
        });

        it("should allow retrieving vested tokens", async () => {
            const vested = await allocator.calculateVestedAmount(beneficiary.address);
            const free = vested < fullAmount - delegatedAmount ? vested : fullAmount - delegatedAmount;
            await (escrow.connect(beneficiary) as unknown as Escrow).retrieve();
            (await skaleToken.balanceOf(beneficiary.address)).should.be.equal(free);
        });
    });

    it("should allow to retrieve all tokens if beneficiary is registered along time ago", async () => {
        const lockupPeriod = 6n;
        const totalVestingDuration = 15n;
        const fullAmount = 4000000n;
        const lockupAmount = 1000000n;
        const vestingIntervalTimeUnit = TimeUnit.MONTH;
        const vestingInterval = 3n;
        const startMonth = await timeHelpers.timestampToMonth(getTimeAtDate(1, 1, 2020));
        const isDelegationAllowed = false;
        const plan = 1;

        await allocator.connect(vestingManager).addPlan(lockupPeriod, totalVestingDuration, vestingIntervalTimeUnit, vestingInterval, isDelegationAllowed, true);
        await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, plan, startMonth, fullAmount, lockupAmount);
        await allocator.connect(vestingManager).startVesting(beneficiary.address);
        const escrowAddress = await allocator.getEscrowAddress(beneficiary.address);
        const escrowFactory = await ethers.getContractFactory("Escrow");
        const escrow = escrowFactory.attach(escrowAddress);
        (await skaleToken.balanceOf(escrowAddress)).should.be.equal(fullAmount);

        const month = 31 * 24 * 60 * 60;
        const year = 12 * month;
        await skipTime(100 * year);

        await (escrow.connect(beneficiary) as unknown as Escrow).retrieve();
        (await skaleToken.balanceOf(escrowAddress)).should.be.equal(0n);
        (await skaleToken.balanceOf(beneficiary.address)).should.be.equal(fullAmount);
    });

    it("should operate with fractional payments", async () => {
        const lockupPeriod = 1n;
        const totalVestingDuration = 4n;
        const fullAmount = 2000000n;
        const lockupAmount = 1000000n;
        const vestingIntervalTimeUnit = TimeUnit.MONTH;
        const vestingInterval = 1n;
        const startMonth = await timeHelpers.getCurrentMonth();
        const startTimestamp = await timeHelpers.monthToTimestamp(startMonth);
        const isDelegationAllowed = false;
        const plan = 1n;
        await allocator.connect(vestingManager).addPlan(lockupPeriod, totalVestingDuration, vestingIntervalTimeUnit, vestingInterval, isDelegationAllowed, true);
        await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, plan, startMonth, fullAmount, lockupAmount);
        await allocator.connect(vestingManager).startVesting(beneficiary.address);
        let lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(1, 7);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedAmount.should.be.equal(fullAmount - lockupAmount);
        await skipTimeToDate(1, 8);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        let lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - lockupAmount - (fullAmount - lockupAmount) / ((totalVestingDuration - lockupPeriod) / vestingInterval));
        await skipTimeToDate(1, 9);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - lockupAmount - (2n * (fullAmount - lockupAmount) / ((totalVestingDuration - lockupPeriod) / vestingInterval)));
        await skipTimeToDate(1, 10);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(0n);
    });

    it("should correctly operate Plan 4: one time payment", async () => {
        const lockupPeriod = 10n;
        const totalVestingDuration = 10n;
        const fullAmount = 2000000n;
        const lockupAmount = 1000000n;
        const vestingIntervalTimeUnit = TimeUnit.MONTH;
        const vestingInterval = 1n;
        const startMonth = await timeHelpers.getCurrentMonth();
        const startTimestamp = await timeHelpers.monthToTimestamp(startMonth);
        const isDelegationAllowed = false;
        const plan = 1n;
        await allocator.connect(vestingManager).addPlan(lockupPeriod, totalVestingDuration, vestingIntervalTimeUnit, vestingInterval, isDelegationAllowed, true);
        await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, plan, startMonth, fullAmount, lockupAmount);
        await allocator.connect(vestingManager).startVesting(beneficiary.address);
        let lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(1, 7);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(1, 8);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        let lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(1, 9);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(1, 10);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(1, 11);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(1, 12);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(1, 1);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(1, 2);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(1, 3);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount);
        await skipTimeToDate(1, 4);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(0n);
    });

    it("should correctly operate Plan 5: each month payment", async () => {
        const lockupPeriod = 1n;
        const totalVestingDuration = 10n;
        const fullAmount = 2000000n;
        const lockupAmount = 200000n;
        const vestingTimeUnit = TimeUnit.MONTH;
        const vestingInterval = 1n;
        const startMonth = await timeHelpers.getCurrentMonth();
        const startTimestamp = await timeHelpers.monthToTimestamp(startMonth);
        const isDelegationAllowed = false;
        const plan = 1n;
        const initDate = new Date(Number(startTimestamp) * 1000);
        await allocator.connect(vestingManager).addPlan(lockupPeriod, totalVestingDuration, vestingTimeUnit, vestingInterval, isDelegationAllowed, true);
        await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, plan, startMonth, fullAmount, lockupAmount);
        await allocator.connect(vestingManager).startVesting(beneficiary.address);
        let lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedAmount.should.be.equal(fullAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(1, 7);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        let lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(fullAmount - lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(1, 8);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 2n * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(1, 9);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 3n * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(1, 10);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 4n * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(1, 11);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 5n * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(1, 12);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 6n * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(1, 1);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 7n * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(1, 2);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 8n * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(1, 3);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 9n * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(1, 4);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 10n * lockupAmount);
        lockedAmount.should.be.equal(0n);
        await expect(allocator.getTimeOfNextVest(beneficiary.address))
            .to.be.revertedWithCustomError(allocator, "VestingIsOver");
    });

    it("should correctly operate Plan 5: each 1 day payment", async () => {
        const lockupPeriod = 1n;
        const totalVestingDuration = 2n;
        const fullAmount = 2000000n;
        const lockupAmount = 200000n;
        const vestingIntervalTimeUnit = TimeUnit.DAY;
        const vestingInterval = 1n;
        const startMonth = await timeHelpers.getCurrentMonth();
        const startTimestamp = await timeHelpers.monthToTimestamp(startMonth);
        const isDelegationAllowed = false;
        const plan = 1n;
        const initDate = new Date(Number(startTimestamp) * 1000);
        await allocator.connect(vestingManager).addPlan(lockupPeriod, totalVestingDuration, vestingIntervalTimeUnit, vestingInterval, isDelegationAllowed, true);
        await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, plan, startMonth, fullAmount, lockupAmount);
        await allocator.connect(vestingManager).startVesting(beneficiary.address);
        let lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedAmount.should.be.equal(fullAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(1, 7);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        let lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(fullAmount - lockupAmount);
        initDate.setUTCDate(initDate.getUTCDate() + Number(vestingInterval));
        (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        for (let day = 2; day < 11; day++) {
            await skipTimeToDate(day, 7);
            lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            initDate.setUTCDate(initDate.getUTCDate() + Number(vestingInterval));
            (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        }

        initDate.setUTCMonth(initDate.getUTCMonth() + 1, 1);
        // finish day
        await skipTimeToDate(1, 8);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(0n);
        await expect(allocator.getTimeOfNextVest(beneficiary.address))
            .to.be.revertedWithCustomError(allocator, "VestingIsOver");
    });

    it("should correctly operate Plan 5: each 1 year payment", async () => {
        const lockupPeriod = 12n;
        const totalVestingDuration = 36n;
        const fullAmount = 3000000n;
        const lockupAmount = 1000000n;
        const vestingIntervalTimeUnit = TimeUnit.YEAR;
        const vestingInterval = 1n;
        const startMonth = await timeHelpers.getCurrentMonth();
        const startTimestamp = await timeHelpers.monthToTimestamp(startMonth);
        const isDelegationAllowed = false;
        const plan = 1;
        const initDate = new Date(Number(startTimestamp) * 1000);
        await allocator.connect(vestingManager).addPlan(lockupPeriod, totalVestingDuration, vestingIntervalTimeUnit, vestingInterval, isDelegationAllowed, true);
        await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, plan, startMonth, fullAmount, lockupAmount);
        await allocator.connect(vestingManager).startVesting(beneficiary.address);
        let lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary.address));
        lockedAmount.should.be.equal(fullAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + Number(vestingInterval));
        (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(1, 5);
        await skipTimeToDate(1, 6);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        let lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(fullAmount - lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + Number(vestingInterval));
        (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(1, 5);
        await skipTimeToDate(1, 6);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary.address));
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 2n * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + Number(vestingInterval));
        (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(1, 5);
        await skipTimeToDate(1, 6);
        lockedAmount = fullAmount - (await allocator.calculateVestedAmount(beneficiary.address));
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
        lockedAmount.should.be.equal(lockedCalculatedAmount);
        lockedAmount.should.be.equal(fullAmount - 3n * lockupAmount);
        lockedAmount.should.be.equal(0);
        await expect(allocator.getTimeOfNextVest(beneficiary.address))
            .to.be.revertedWithCustomError(allocator, "VestingIsOver");
    });

    it("should correctly operate Plan 6: each day payment for 3 month", async () => {
        const lockupPeriod = 12n;
        const totalVestingDuration = 15n;
        const fullAmount = 2000000n;
        const lockupAmount = 650000n;
        const vestingIntervalTimeUnit = TimeUnit.DAY;
        const vestingInterval = 1n;
        const startMonth = await timeHelpers.getCurrentMonth();
        const startTimestamp = await timeHelpers.monthToTimestamp(startMonth);
        const isDelegationAllowed = false;
        const plan = 1n;
        const initDate = new Date(Number(startTimestamp) * 1000);
        await allocator.connect(vestingManager).addPlan(lockupPeriod, totalVestingDuration, vestingIntervalTimeUnit, vestingInterval, isDelegationAllowed, true);
        await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, plan, startMonth, fullAmount, lockupAmount);
        await allocator.connect(vestingManager).startVesting(beneficiary.address);

        await skipTimeToDate(1, 5); // 01.05.2022
        let lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedAmount.should.be.equal(fullAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + Number(lockupPeriod)) / 12, (initDate.getUTCMonth() + Number(lockupPeriod)) % 12);
        (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());

        await skipTimeToDate(1, 6); // 01.06.2022
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedAmount.should.be.equal(fullAmount - lockupAmount);
        initDate.setUTCDate(initDate.getUTCDate() + Number(vestingInterval));
        (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());

        for (let i = 2; i <= 92; i++) {
            await skipTimeToDate(i, 6);
            lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
            const lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            initDate.setUTCDate(initDate.getUTCDate() + Number(vestingInterval));
            (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        }
    });


    it("should correctly operate Plan 7: twice payment", async () => {
        const lockupPeriod = 9;
        const totalVestingDuration = 15;
        const fullAmount = 2000000n;
        const lockupAmount = 1000000n;
        const vestingIntervalTimeUnit = TimeUnit.MONTH;
        const vestingInterval = 6;
        const startMonth = await timeHelpers.getCurrentMonth();
        const startTimestamp = await timeHelpers.monthToTimestamp(startMonth);
        const isDelegationAllowed = false;
        const plan = 1n;
        const initDate = new Date(Number(startTimestamp) * 1000);
        await allocator.connect(vestingManager).addPlan(lockupPeriod, totalVestingDuration, vestingIntervalTimeUnit, vestingInterval, isDelegationAllowed, true);
        await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, plan, startMonth, fullAmount, lockupAmount);
        await allocator.connect(vestingManager).startVesting(beneficiary.address);

        await skipTimeToDate(1, 2);
        let lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedAmount.should.be.equal(fullAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + Number(lockupPeriod)) / 12, (initDate.getUTCMonth() + Number(lockupPeriod)) % 12);
        (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());

        await skipTimeToDate(1, 3);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedAmount.should.be.equal(fullAmount / 2n);
        initDate.setUTCMonth(initDate.getUTCMonth() + vestingInterval);
        (await allocator.getTimeOfNextVest(beneficiary.address)).toString().should.be.equal((initDate.getTime() / 1000).toString());

        await skipTimeToDate(1, 9);
        lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
        lockedAmount.should.be.equal(0n);
        initDate.setUTCMonth(initDate.getUTCMonth() + vestingInterval);
        await expect(allocator.getTimeOfNextVest(beneficiary.address))
            .to.be.revertedWithCustomError(allocator, "VestingIsOver");

    });

    it("should not add plan with zero vesting duration", async () => {
        const lockupPeriod = 0;
        const totalVestingDuration = 0;
        const vestingIntervalTimeUnit = TimeUnit.MONTH;
        const vestingInterval = 0;
        const isDelegationAllowed = false;
        await expect(allocator.connect(vestingManager).addPlan(lockupPeriod, totalVestingDuration, vestingIntervalTimeUnit, vestingInterval, isDelegationAllowed, true))
            .to.be.revertedWithCustomError(allocator, "VestingDurationZero");
    });

    describe("when Plans are registered at the past", () => {
        const lockupPeriod = 6n;
        const totalVestingDuration = 36n;
        const fullAmount = 6000000n;
        const lockupAmount = 1000000n;
        const vestingInterval = 6n;
        const vestingIntervalTimeUnit = TimeUnit.MONTH;
        const isDelegationAllowed = false;

        let startMonth: bigint;
        let startTimestamp: bigint;
        let escrow: Escrow;

        beforeEach(async () => {
            const time = await currentTime();
            const currentDate = new Date(time * 1000);
            const previousYear = currentDate.getFullYear() - 1;
            startMonth = await timeHelpers.timestampToMonth(getTimeAtDate(1, 9, previousYear));
            startTimestamp = await timeHelpers.monthToTimestamp(startMonth);
            // Plan example 0
            const plan = 1n;
            await allocator.connect(vestingManager).addPlan(lockupPeriod, totalVestingDuration, vestingIntervalTimeUnit, vestingInterval, isDelegationAllowed, true);
            await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, plan, startMonth, fullAmount, lockupAmount);
            await allocator.connect(vestingManager).startVesting(beneficiary.address);

            const escrowFactory = await ethers.getContractFactory("Escrow");
            escrow = (escrowFactory.attach(await allocator.getEscrowAddress(beneficiary.address))) as unknown as Escrow;
        });

        it("should unlock tokens after lockup", async () => {
            const lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
            const lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
            // Plan 0 lockup amount unlocked
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(fullAmount - lockupAmount);
        });

        it("should be able to transfer token", async () => {
            await (escrow.connect(beneficiary) as unknown as Escrow).retrieve();
            (await skaleToken.balanceOf(beneficiary.address)).should.be.equal(lockupAmount);
            await skaleToken.connect(beneficiary).transfer(beneficiary1.address, "100");
            (await skaleToken.balanceOf(beneficiary.address)).should.be.equal(lockupAmount - 100n);
            (await skaleToken.balanceOf(beneficiary1.address)).should.be.equal(100n);
        });

        it("should not be able to transfer more than unlocked", async () => {
            await (escrow.connect(beneficiary) as unknown as Escrow).retrieve();
            (await skaleToken.balanceOf(beneficiary.address)).should.be.equal(lockupAmount);
            await expect(skaleToken.connect(beneficiary).transfer(beneficiary1.address, "1000001"))
                .to.be.revertedWith("ERC777: transfer amount exceeds balance");
        });

        it("should unlock tokens first part after lockup", async () => {
            await skipTimeToDate(1, 9)
            const lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
            const lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingIntervalTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.lessThan(fullAmount - lockupAmount);
        });

        it("should work if Escrow was refilled", async () => {
            await skaleToken.mint(hacker.address, 1n, "0x", "0x");
            await skaleToken.connect(hacker).transfer(escrow.target, 1n);

            const vested = await allocator.calculateVestedAmount(beneficiary.address);
            await (escrow.connect(beneficiary) as unknown as Escrow).retrieve();
            (await skaleToken.balanceOf(beneficiary.address)).should.be.equal(vested + 1n);
        });
    });

    describe("when all beneficiaries are registered", () => {
        const lockupPeriod = 6n;
        const totalVestingDuration = 36n;
        const fullAmount = 6000000n;
        const lockupAmount = 1000000n;
        const vestingInterval = 6n;
        const vestingTimeUnit = TimeUnit.MONTH;
        const isDelegationAllowed = false;
        const planId = 1;

        const lockupPeriod1 = 12n;
        const totalVestingDuration1 = 15n;
        const fullAmount1 = 1000000n;
        const lockupAmount1 = 500000n;
        const vestingInterval1 = 3n;
        const vestingIntervalTimeUnit1 = TimeUnit.MONTH;
        const isDelegationAllowed1 = false;
        const planId1 = 2;

        const lockupPeriod2 = 9n;
        const totalVestingDuration2 = 15n;
        const fullAmount2 = 1000000n;
        const lockupAmount2 = 500000n;
        const vestingInterval2 = 6n;
        const vestingIntervalTimeUnit2 = TimeUnit.MONTH;
        const isDelegationAllowed2 = false;
        const planId2 = 3;

        const lockupPeriod3 = 12n;
        const totalVestingDuration3 = 36n;
        const fullAmount3 = 36000000n;
        const lockupAmount3 = 12000000n;
        const vestingInterval3 = 1n;
        const vestingIntervalTimeUnit3 = TimeUnit.MONTH;
        const isDelegationAllowed3 = false;
        const planId3 = 4;

        let startMonth: bigint;
        let startTimestamp: bigint;

        beforeEach(async () => {
            startMonth = await timeHelpers.getCurrentMonth();
            startTimestamp = await timeHelpers.monthToTimestamp(startMonth);
            // Plan example 0
            await allocator.connect(vestingManager).addPlan(lockupPeriod, totalVestingDuration, vestingTimeUnit, vestingInterval, isDelegationAllowed, true);
            await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, planId, startMonth, fullAmount, lockupAmount);
            await allocator.connect(vestingManager).startVesting(beneficiary.address);
            // Plan example 1
            await allocator.connect(vestingManager).addPlan(lockupPeriod1, totalVestingDuration1, vestingIntervalTimeUnit1, vestingInterval1, isDelegationAllowed1, true);
            await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary1.address, planId1, startMonth, fullAmount1, lockupAmount1);
            await allocator.connect(vestingManager).startVesting(beneficiary1.address);
            // Plan example 2
            await allocator.connect(vestingManager).addPlan(lockupPeriod2, totalVestingDuration2, vestingIntervalTimeUnit2, vestingInterval2, isDelegationAllowed2, true);
            await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary2.address, planId2, startMonth, fullAmount2, lockupAmount2);
            await allocator.connect(vestingManager).startVesting(beneficiary2.address);
            // Plan example 3
            await allocator.connect(vestingManager).addPlan(lockupPeriod3, totalVestingDuration3, vestingIntervalTimeUnit3, vestingInterval3, isDelegationAllowed3, true);
            await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary3.address, planId3, startMonth, fullAmount3, lockupAmount3);
            await allocator.connect(vestingManager).startVesting(beneficiary3.address);
        });

        it("should show balance of all escrows", async () => {
            let escrowAddress = await allocator.getEscrowAddress(beneficiary.address);
            (await skaleToken.balanceOf(escrowAddress)).should.be.equal(fullAmount);
            escrowAddress = await allocator.getEscrowAddress(beneficiary1.address);
            (await skaleToken.balanceOf(escrowAddress)).should.be.equal(fullAmount1);
            escrowAddress = await allocator.getEscrowAddress(beneficiary2.address);
            (await skaleToken.balanceOf(escrowAddress)).should.be.equal(fullAmount2);
            escrowAddress = await allocator.getEscrowAddress(beneficiary3.address);
            (await skaleToken.balanceOf(escrowAddress)).should.be.equal(fullAmount3);
        });

        it("All tokens should be locked of all beneficiaries", async () => {
            let lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
            lockedAmount.should.be.equal(fullAmount);

            lockedAmount = fullAmount1 - await allocator.calculateVestedAmount(beneficiary1.address);
            lockedAmount.should.be.equal(fullAmount1);

            lockedAmount = fullAmount2 - await allocator.calculateVestedAmount(beneficiary2.address);
            lockedAmount.should.be.equal(fullAmount2);

            lockedAmount = fullAmount3 - await allocator.calculateVestedAmount(beneficiary3.address);
            lockedAmount.should.be.equal(fullAmount3);
        });

        it("After 6 month", async () => {
            // skip to Jan 1st
            await skipTimeToDate(1, 0);

            let lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
            const lockedCalculatedAmount = calculateLockedAmount(
                await currentTime(),
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

            lockedAmount = fullAmount1 - await allocator.calculateVestedAmount(beneficiary1.address);
            lockedAmount.should.be.equal(fullAmount1);

            lockedAmount = fullAmount2 - await allocator.calculateVestedAmount(beneficiary2.address);
            lockedAmount.should.be.equal(fullAmount2);

            lockedAmount = fullAmount3 - await allocator.calculateVestedAmount(beneficiary3.address);
            lockedAmount.should.be.equal(fullAmount3);
        });

        it("After 9 month", async () => {
            await skipTimeToDate(1, 3);
            let lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            // Beneficiary 0 only lockup amount unlocked
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(fullAmount - lockupAmount);

            lockedAmount = fullAmount1 - await allocator.calculateVestedAmount(beneficiary1.address);
            lockedAmount.should.be.equal(fullAmount1);

            // Beneficiary 2 lockup amount unlocked
            lockedAmount = fullAmount2 - await allocator.calculateVestedAmount(beneficiary2.address);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod2, totalVestingDuration2, fullAmount2, lockupAmount2, vestingIntervalTimeUnit2, vestingInterval2);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(fullAmount2 - lockupAmount2);

            lockedAmount = fullAmount3 - await allocator.calculateVestedAmount(beneficiary3.address);
            lockedAmount.should.be.equal(fullAmount3);
        });

        it("After 12 month", async () => {
            await skipTimeToDate(1, 12);
            await skipTimeToDate(1, 6);

            let lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.lessThan(fullAmount - lockupAmount);

            // Plan 1 lockup amount unlocked
            lockedAmount = fullAmount1 - await allocator.calculateVestedAmount(beneficiary1.address);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod1, totalVestingDuration1, fullAmount1, lockupAmount1, vestingIntervalTimeUnit1, vestingInterval1);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(fullAmount1 - lockupAmount1);

            // Plan 2 lockup amount unlocked
            lockedAmount = fullAmount2 - await allocator.calculateVestedAmount(beneficiary2.address);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod2, totalVestingDuration2, fullAmount2, lockupAmount2, vestingIntervalTimeUnit2, vestingInterval2);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(fullAmount2 - lockupAmount2);

            // Plan 3 lockup amount unlocked
            lockedAmount = fullAmount3 - await allocator.calculateVestedAmount(beneficiary3.address);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod3, totalVestingDuration3, fullAmount3, lockupAmount3, vestingIntervalTimeUnit3, vestingInterval3);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(fullAmount3 - lockupAmount3);
        });

        it("should be possible to send tokens", async () => {
            await skipTimeToDate(1, 12);
            await skipTimeToDate(1, 6);
            let escrowAddress = await allocator.getEscrowAddress(beneficiary.address);
            const escrowFactory = await ethers.getContractFactory("Escrow");
            let escrow = escrowFactory.attach(escrowAddress);
            (await skaleToken.balanceOf(escrowAddress)).should.be.equal(fullAmount);
            await (escrow.connect(beneficiary) as unknown as Escrow).retrieve();
            escrowAddress = await allocator.getEscrowAddress(beneficiary1.address);
            escrow = escrowFactory.attach(escrowAddress);
            (await skaleToken.balanceOf(escrowAddress)).should.be.equal(fullAmount1);
            await (escrow.connect(beneficiary1) as unknown as Escrow).retrieve();
            escrowAddress = await allocator.getEscrowAddress(beneficiary2.address);
            escrow = escrowFactory.attach(escrowAddress);
            (await skaleToken.balanceOf(escrowAddress)).should.be.equal(fullAmount2);
            await (escrow.connect(beneficiary2) as unknown as Escrow).retrieve();
            escrowAddress = await allocator.getEscrowAddress(beneficiary3.address);
            escrow = escrowFactory.attach(escrowAddress);
            (await skaleToken.balanceOf(escrowAddress)).should.be.equal(fullAmount3);
            await (escrow.connect(beneficiary3) as unknown as Escrow).retrieve();
            await skaleToken.connect(beneficiary).transfer(hacker.address, "100");
            await skaleToken.connect(beneficiary1).transfer(hacker.address, "100");
            await skaleToken.connect(beneficiary2).transfer(hacker.address, "100");
            await skaleToken.connect(beneficiary3).transfer(hacker.address, "100");
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            (await skaleToken.balanceOf(beneficiary.address)).should.be.equal(fullAmount - lockedCalculatedAmount - 100n);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod1, totalVestingDuration1, fullAmount1, lockupAmount1, vestingIntervalTimeUnit1, vestingInterval1);
            (await skaleToken.balanceOf(beneficiary1.address)).should.be.equal(fullAmount1 - lockedCalculatedAmount - 100n);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod2, totalVestingDuration2, fullAmount2, lockupAmount2, vestingIntervalTimeUnit2, vestingInterval2);
            (await skaleToken.balanceOf(beneficiary2.address)).should.be.equal(fullAmount2 - lockedCalculatedAmount - 100n);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod3, totalVestingDuration3, fullAmount3, lockupAmount3, vestingIntervalTimeUnit3, vestingInterval3);
            (await skaleToken.balanceOf(beneficiary3.address)).should.be.equal(fullAmount3 - lockedCalculatedAmount - 100n);
            (await skaleToken.balanceOf(hacker.address)).should.be.equal(400n);
        });

        it("After 15 month", async () => {
            await skipTimeToDate(1, 3);
            await skipTimeToDate(1, 9);

            let lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.lessThan(fullAmount - lockupAmount);

            // Plan 1 unlocked all tokens
            lockedAmount = fullAmount1 - await allocator.calculateVestedAmount(beneficiary1.address);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod1, totalVestingDuration1, fullAmount1, lockupAmount1, vestingIntervalTimeUnit1, vestingInterval1);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(0n);

            // Plan 2 unlocked all tokens
            lockedAmount = fullAmount2 - await allocator.calculateVestedAmount(beneficiary2.address);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod2, totalVestingDuration2, fullAmount2, lockupAmount2, vestingIntervalTimeUnit2, vestingInterval2);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(0n);

            lockedAmount = fullAmount3 - await allocator.calculateVestedAmount(beneficiary3.address);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod3, totalVestingDuration3, fullAmount3, lockupAmount3, vestingIntervalTimeUnit3, vestingInterval3);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.lessThan(fullAmount3 - lockupAmount3);
        });

        it("After 16, 17, 18 month", async () => {
            await skipTimeToDate(1, 5);
            await skipTimeToDate(1, 10);

            let lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
            const plan0unlocked16 = lockedAmount;
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            lockedAmount = fullAmount3 - await allocator.calculateVestedAmount(beneficiary3.address);
            const plan3unlocked16 = lockedAmount;
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod3, totalVestingDuration3, fullAmount3, lockupAmount3, vestingIntervalTimeUnit3, vestingInterval3);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            await skipTimeToDate(1, 11);

            lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
            const plan0unlocked17 = lockedAmount;
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            lockedAmount = fullAmount3 - await allocator.calculateVestedAmount(beneficiary3.address);
            const plan3unlocked17 = lockedAmount;
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod3, totalVestingDuration3, fullAmount3, lockupAmount3, vestingIntervalTimeUnit3, vestingInterval3);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            plan0unlocked16.should.be.equal(plan0unlocked17);

            await skipTimeToDate(1, 12);

            lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
            const plan0unlocked18 = lockedAmount;
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            lockedAmount = fullAmount3 - await allocator.calculateVestedAmount(beneficiary3.address);
            const plan3unlocked18 = lockedAmount;
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod3, totalVestingDuration3, fullAmount3, lockupAmount3, vestingIntervalTimeUnit3, vestingInterval3);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            (plan3unlocked16 - plan3unlocked17).should.be.equal(plan3unlocked17 - plan3unlocked18);

            plan0unlocked18.should.be.lessThan(plan0unlocked17);
        });

        it("After 24, 30, 36 month", async () => {
            await skipTimeToDate(1, 5);
            await skipTimeToDate(1, 4);
            await skipTimeToDate(1, 6);

            let lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
            const plan0unlocked24 = lockedAmount;
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            lockedAmount = fullAmount3 - await allocator.calculateVestedAmount(beneficiary3.address);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod3, totalVestingDuration3, fullAmount3, lockupAmount3, vestingIntervalTimeUnit3, vestingInterval3);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            await skipTimeToDate(1, 12);

            lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
            const plan0unlocked30 = lockedAmount;
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            lockedAmount = fullAmount3 - await allocator.calculateVestedAmount(beneficiary3.address);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod3, totalVestingDuration3, fullAmount3, lockupAmount3, vestingIntervalTimeUnit3, vestingInterval3);
            lockedAmount.should.be.equal(lockedCalculatedAmount);

            await skipTimeToDate(1, 6);

            lockedAmount = fullAmount - await allocator.calculateVestedAmount(beneficiary.address);
            const plan0unlocked36 = lockedAmount;
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod, totalVestingDuration, fullAmount, lockupAmount, vestingTimeUnit, vestingInterval);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(0n);

            lockedAmount = fullAmount3 - await allocator.calculateVestedAmount(beneficiary3.address);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(), startTimestamp, lockupPeriod3, totalVestingDuration3, fullAmount3, lockupAmount3, vestingIntervalTimeUnit3, vestingInterval3);
            lockedAmount.should.be.equal(lockedCalculatedAmount);
            lockedAmount.should.be.equal(0n);

            (plan0unlocked24 - plan0unlocked30).should.be.equal(plan0unlocked30 - plan0unlocked36);
        });
    });

    describe("should calculate next vest time correctly", () => {
        it("from Dec 30, year based vesting", async () => {
            await allocator.connect(vestingManager).addPlan(0, 2 * 12, TimeUnit.YEAR, 1, false, false);
            const plan = 1;

            const currentYear = new Date(await currentTime() * 1000).getFullYear();
            const startDate = (new Date(currentYear.toString() + "-12-30T00:00:00.000+00:00")).getTime() / 1000; // Dec 30th
            const startMonth = await timeHelpers.timestampToMonth(startDate.toString(10)); // Dec

            // start from Dec
            await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, plan, startMonth, 5, 0);

            // skip to Jan 1st
            await skipTimeToDate(1, 0);

            (await allocator.getTimeOfNextVest(beneficiary.address))
                .should.be.equal((new Date((currentYear + 1).toString() + "-12-01T00:00:00.000+00:00")).getTime() / 1000);
        });

        it("from Dec 30, month based vesting", async () => {
            await allocator.connect(vestingManager).addPlan(0, 2 * 12, TimeUnit.MONTH, 1, false, false);
            const plan = 1;

            const currentYear = new Date(await currentTime() * 1000).getFullYear();
            const startDate = (new Date(currentYear.toString() + "-12-30T00:00:00.000+00:00")).getTime() / 1000; // Dec 30th
            const startMonth = await timeHelpers.timestampToMonth(startDate.toString(10)); // Dec

            // start from Dec
            await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, plan, startMonth, 5, 0);

            // skip to Jan 1st
            await skipTimeToDate(1, 0);

            (await allocator.getTimeOfNextVest(beneficiary.address))
                .should.be.equal((new Date((currentYear + 1).toString() + "-02-01T00:00:00.000+00:00")).getTime() / 1000);
        });

        it("from Dec 30, day based vesting", async () => {
            await allocator.connect(vestingManager).addPlan(0, 2 * 12, TimeUnit.DAY, 1, false, false);
            const plan = 1;

            const currentYear = new Date(await currentTime() * 1000).getFullYear();
            const startDate = (new Date(currentYear.toString() + "-12-30T00:00:00.000+00:00")).getTime() / 1000; // Dec 30th
            const startMonth = await timeHelpers.timestampToMonth(startDate.toString(10)); // Dec

            // start from Dec
            await allocator.connect(vestingManager).connectBeneficiaryToPlan(beneficiary.address, plan, startMonth, 5, 0);

            // skip to Jan 1st
            await skipTimeToDate(1, 0);

            (await allocator.getTimeOfNextVest(beneficiary.address))
                .should.be.equal((new Date((currentYear + 1).toString() + "-01-02T00:00:00.000+00:00")).getTime() / 1000);
        });
    });
});
