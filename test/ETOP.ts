import { ContractManagerInstance,
    // DelegationControllerInstance,
    SkaleTokenTesterInstance,
    // ValidatorServiceInstance,
    ETOPInstance,
    VestingEscrowContract,
    VestingEscrowInstance} from "./../types/truffle-contracts";

const VestingEscrow: VestingEscrowContract = artifacts.require("./VestingEscrow");

import { calculateLockedAmount } from "./tools/vestingCalculation";
import { currentTime, getTimeAtDate, skipTimeToDate } from "./tools/time";

import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import { deployContractManager } from "./tools/deploy/contractManager";
// import { deployDelegationController } from "../tools/deploy/delegation/delegationController";
// import { deployValidatorService } from "../tools/deploy/delegation/validatorService";
import { deployETOP } from "./tools/deploy/etop";
import { deploySkaleTokenTester } from "./tools/deploy/test/skaleTokenTester";
chai.should();
chai.use(chaiAsPromised);

contract("ETOP", ([owner, holder, holder1, holder2, holder3, hacker]) => {
    let contractManager: ContractManagerInstance;
    let skaleToken: SkaleTokenTesterInstance;
    // let validatorService: ValidatorServiceInstance;
    let ETOP: ETOPInstance;
    // let delegationController: DelegationControllerInstance;

    beforeEach(async () => {
        contractManager = await deployContractManager();
        skaleToken = await deploySkaleTokenTester(contractManager);
        // validatorService = await deployValidatorService(contractManager);
        // delegationController = await deployDelegationController(contractManager);
        ETOP = await deployETOP(contractManager);

        // each test will start from July 1
        await skipTimeToDate(web3, 1, 6);
        await skaleToken.mint(ETOP.address, 1e9, "0x", "0x");
    });

    it("should register ETOP holder", async () => {
        (await ETOP.isHolderRegistered(holder)).should.be.eq(false);
        await ETOP.addVestingPlan(6, 36, 2, 6, false, {from: owner});
        await ETOP.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner});
        (await ETOP.isHolderRegistered(holder)).should.be.eq(true);
        (await ETOP.isApprovedHolder(holder)).should.be.eq(false);
        (await ETOP.isActiveVestingTerm(holder)).should.be.eq(false);
    });

    it("should get ETOP data", async () => {
        (await ETOP.isHolderRegistered(holder)).should.be.eq(false);
        await ETOP.addVestingPlan(6, 36, 2, 6, false, {from: owner});
        await ETOP.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner});
        (await ETOP.isHolderRegistered(holder)).should.be.eq(true);
        ((await ETOP.getStartVestingTime(holder)).toNumber()).should.be.equal(getTimeAtDate(1, 6, 2020));
        ((await ETOP.getLockupPeriodInMonth(holder)).toNumber()).should.be.equal(6);
        ((await ETOP.getLockupPeriodTimestamp(holder)).toNumber()).should.be.equal(getTimeAtDate(1, 0, 2021));
        // (await ETOP.isCancelableVestingTerm(holder)).should.be.equal(false);
        ((await ETOP.getFinishVestingTime(holder)).toNumber()).should.be.equal(getTimeAtDate(1, 6, 2023));
    });

    it("should approve ETOP", async () => {
        (await ETOP.isHolderRegistered(holder)).should.be.eq(false);
        await ETOP.addVestingPlan(6, 36, 2, 6, false, {from: owner});
        await ETOP.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner});
        (await ETOP.isHolderRegistered(holder)).should.be.eq(true);
        (await ETOP.isApprovedHolder(holder)).should.be.eq(false);
        await ETOP.approveHolder({from: holder});
        (await ETOP.isApprovedHolder(holder)).should.be.eq(true);
        (await ETOP.isActiveVestingTerm(holder)).should.be.eq(false);
    });

    it("should not approve ETOP from hacker", async () => {
        (await ETOP.isHolderRegistered(holder)).should.be.eq(false);
        await ETOP.addVestingPlan(6, 36, 2, 6, false, {from: owner});
        await ETOP.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner});
        (await ETOP.isHolderRegistered(holder)).should.be.eq(true);
        (await ETOP.isApprovedHolder(holder)).should.be.eq(false);
        await ETOP.approveHolder({from: hacker}).should.be.eventually.rejectedWith("Holder is not registered");
        (await ETOP.isApprovedHolder(holder)).should.be.eq(false);
        (await ETOP.isActiveVestingTerm(holder)).should.be.eq(false);
    });

    it("should not approve ETOP twice", async () => {
        (await ETOP.isHolderRegistered(holder)).should.be.eq(false);
        await ETOP.addVestingPlan(6, 36, 2, 6, false, {from: owner});
        await ETOP.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner});
        (await ETOP.isHolderRegistered(holder)).should.be.eq(true);
        (await ETOP.isApprovedHolder(holder)).should.be.eq(false);
        await ETOP.approveHolder({from: holder});
        (await ETOP.isApprovedHolder(holder)).should.be.eq(true);
        (await ETOP.isActiveVestingTerm(holder)).should.be.eq(false);
        await ETOP.approveHolder({from: holder}).should.be.eventually.rejectedWith("Holder is already approved");
    });

    it("should not start vesting without approve ETOP", async () => {
        (await ETOP.isHolderRegistered(holder)).should.be.eq(false);
        await ETOP.addVestingPlan(6, 36, 2, 6, false, {from: owner});
        await ETOP.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner});
        (await ETOP.isHolderRegistered(holder)).should.be.eq(true);
        (await ETOP.isApprovedHolder(holder)).should.be.eq(false);
        await ETOP.startVesting(holder, {from: owner}).should.be.eventually.rejectedWith("Holder is not approved");
        (await ETOP.isApprovedHolder(holder)).should.be.eq(false);
        (await ETOP.isActiveVestingTerm(holder)).should.be.eq(false);
    });

    it("should not start vesting without registering ETOP", async () => {
        (await ETOP.isHolderRegistered(holder)).should.be.eq(false);
        await ETOP.startVesting(holder, {from: owner}).should.be.eventually.rejectedWith("Holder is not registered");
        (await ETOP.isHolderRegistered(holder)).should.be.eq(false);
        (await ETOP.isApprovedHolder(holder)).should.be.eq(false);
        (await ETOP.isActiveVestingTerm(holder)).should.be.eq(false);
    });

    it("should start vesting with register & approve ETOP", async () => {
        (await ETOP.isHolderRegistered(holder)).should.be.eq(false);
        await ETOP.addVestingPlan(6, 36, 2, 6, false, {from: owner});
        await ETOP.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner});
        (await ETOP.isHolderRegistered(holder)).should.be.eq(true);
        (await ETOP.isApprovedHolder(holder)).should.be.eq(false);
        await ETOP.approveHolder({from: holder});
        (await ETOP.isApprovedHolder(holder)).should.be.eq(true);
        (await ETOP.isActiveVestingTerm(holder)).should.be.eq(false);
        await ETOP.startVesting(holder, {from: owner});
        (await ETOP.isActiveVestingTerm(holder)).should.be.eq(true);
    });

    // it("should stop cancelable vesting before start", async () => {
    //     (await ETOP.isHolderRegistered(holder)).should.be.eq(false);
    //     await ETOP.addVestingTerm(holder, getTimeAtDate(1, 6, 2020), 6, 36, 1e6, 1e5, 6, true, {from: owner});
    //     (await ETOP.isHolderRegistered(holder)).should.be.eq(true);
    //     (await ETOP.isApprovedHolder(holder)).should.be.eq(false);
    //     await ETOP.approveHolder({from: holder});
    //     (await ETOP.isApprovedHolder(holder)).should.be.eq(true);
    //     (await ETOP.isActiveVestingTerm(holder)).should.be.eq(false);
    //     await ETOP.stopVesting(holder, {from: owner});
    //     await ETOP.startVesting(holder, {from: owner}).should.be.eventually.rejectedWith("ETOP is already canceled");
    //     (await ETOP.isActiveVestingTerm(holder)).should.be.eq(false);
    // });

    // it("should stop cancelable vesting after start", async () => {
    //     (await ETOP.isHolderRegistered(holder)).should.be.eq(false);
    //     await ETOP.addVestingTerm(holder, getTimeAtDate(1, 6, 2020), 6, 36, 1e6, 1e5, 6, true, {from: owner});
    //     (await ETOP.isHolderRegistered(holder)).should.be.eq(true);
    //     (await ETOP.isApprovedHolder(holder)).should.be.eq(false);
    //     await ETOP.approveHolder({from: holder});
    //     (await ETOP.isApprovedHolder(holder)).should.be.eq(true);
    //     (await ETOP.isActiveVestingTerm(holder)).should.be.eq(false);
    //     await ETOP.startVesting(holder, {from: owner});
    //     (await ETOP.isActiveVestingTerm(holder)).should.be.eq(true);
    //     await ETOP.stopVesting(holder, {from: owner});
    //     (await ETOP.isActiveVestingTerm(holder)).should.be.eq(false);
    //     await ETOP.startVesting(holder, {from: owner}).should.be.eventually.rejectedWith("ETOP is already canceled");
    //     (await ETOP.isActiveVestingTerm(holder)).should.be.eq(false);
    // });

    // it("should stop not-cancelable vesting before start", async () => {
    //     (await ETOP.isHolderRegistered(holder)).should.be.eq(false);
    //     await ETOP.addVestingTerm(holder, getTimeAtDate(1, 6, 2020), 6, 36, 1e6, 1e5, 6, false, {from: owner});
    //     (await ETOP.isHolderRegistered(holder)).should.be.eq(true);
    //     (await ETOP.isApprovedHolder(holder)).should.be.eq(false);
    //     await ETOP.approveHolder({from: holder});
    //     (await ETOP.isApprovedHolder(holder)).should.be.eq(true);
    //     (await ETOP.isActiveVestingTerm(holder)).should.be.eq(false);
    //     await ETOP.stopVesting(holder, {from: owner});
    //     await ETOP.startVesting(holder, {from: owner}).should.be.eventually.rejectedWith("ETOP is already canceled");
    //     (await ETOP.isActiveVestingTerm(holder)).should.be.eq(false);
    // });

    // it("should not stop not-cancelable vesting before start", async () => {
    //     (await ETOP.isHolderRegistered(holder)).should.be.eq(false);
    //     await ETOP.addVestingTerm(holder, getTimeAtDate(1, 6, 2020), 6, 36, 1e6, 1e5, 6, false, {from: owner});
    //     (await ETOP.isHolderRegistered(holder)).should.be.eq(true);
    //     (await ETOP.isApprovedHolder(holder)).should.be.eq(false);
    //     await ETOP.approveHolder({from: holder});
    //     (await ETOP.isApprovedHolder(holder)).should.be.eq(true);
    //     (await ETOP.isActiveVestingTerm(holder)).should.be.eq(false);
    //     await ETOP.startVesting(holder, {from: owner});
    //     (await ETOP.isActiveVestingTerm(holder)).should.be.eq(true);
    //     await ETOP.stopVesting(holder, {from: owner}).should.be.eventually.rejectedWith("You could not stop vesting for holder");
    //     (await ETOP.isActiveVestingTerm(holder)).should.be.eq(true);
    // });

    it("should not register ETOP Plan if sender is not owner", async () => {
        await ETOP.addVestingPlan(6, 36, 2, 6, false, {from: hacker}).should.be.eventually.rejectedWith("Caller is not the owner");
        // await ETOP.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner});
        // await ETOP.addVestingTerm(holder, getTimeAtDate(1, 6, 2020), 6, 36, 1e6, 1e5, 6, false, {from: hacker}).should.be.eventually.rejectedWith("Ownable: caller is not the owner");
    });

    it("should not connect holder to Plan  if sender is not owner", async () => {
        await ETOP.addVestingPlan(6, 36, 2, 6, false, {from: owner});
        await ETOP.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: hacker}).should.be.eventually.rejectedWith("Caller is not the owner");
        // await ETOP.addVestingTerm(holder, getTimeAtDate(1, 6, 2020), 6, 36, 1e6, 1e5, 6, false, {from: hacker}).should.be.eventually.rejectedWith("Ownable: caller is not the owner");
    });

    it("should not register already registered ETOP holder", async () => {
        await ETOP.addVestingPlan(6, 36, 2, 6, false, {from: owner});
        await ETOP.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner});
        await ETOP.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner}).should.be.eventually.rejectedWith("Holder is already added");
        await ETOP.addVestingPlan(6, 36, 2, 6, false, {from: owner});
        await ETOP.connectHolderToPlan(holder, 2, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner}).should.be.eventually.rejectedWith("Holder is already added");
        // await ETOP.addVestingTerm(holder, getTimeAtDate(1, 6, 2020), 6, 36, 1e6, 1e5, 6, false, {from: owner});
        // await ETOP.addVestingTerm(holder, getTimeAtDate(1, 6, 2020), 6, 36, 1e6, 1e5, 6, false, {from: owner}).should.be.eventually.rejectedWith("ETOP holder is already added");
    });

    it("should not register ETOP Plan if periods incorrect", async () => {
        await ETOP.addVestingPlan(37, 36, 2, 6, false, {from: owner}).should.be.eventually.rejectedWith("Incorrect periods");
    });

    it("should not register ETOP Plan if vesting times incorrect", async () => {
        await ETOP.addVestingPlan(6, 36, 2, 7, false, {from: owner}).should.be.eventually.rejectedWith("Incorrect vesting times");
    });

    it("should not connect holder to ETOP Plan if amounts incorrect", async () => {
        await ETOP.addVestingPlan(6, 36, 2, 6, false, {from: owner});
        await ETOP.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e5, 1e6, {from: owner}).should.be.eventually.rejectedWith("Incorrect amounts");
    });

    it("should not connect holder to ETOP Plan if period starts incorrect", async () => {
        const time = await currentTime(web3);
        const currentDate = new Date(time * 1000);
        const nextYear = currentDate.getFullYear() + 1;
        await ETOP.addVestingPlan(6, 36, 2, 6, false, {from: owner});
        await ETOP.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, nextYear), 1e6, 1e5, {from: owner}).should.be.eventually.rejectedWith("Incorrect period starts");
        // await ETOP.addVestingTerm(holder, getTimeAtDate(1, 6, nextYear), 6, 36, 1e6, 1e5, 6, false, {from: owner}).should.be.eventually.rejectedWith("Incorrect period starts");
    });

    // it("should be possible to delegate ETOP tokens", async () => {
    //     await ETOP.addVestingPlan(6, 36, 2, 6, false, {from: owner});
    //     await ETOP.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner})
    //     // await ETOP.addVestingTerm(holder, getTimeAtDate(1, 6, 2020), 6, 36, 1e6, 1e5, 6, false, {from: owner});
    //     await ETOP.approveHolder({from: holder});
    //     await ETOP.startVesting(holder, {from: owner});
    //     (await skaleToken.balanceOf(holder)).toNumber().should.be.equal(1e6);
    //     await validatorService.registerValidator("Validator", "D2 is even", 150, 0, {from: owner});
    //     await validatorService.enableValidator(1, {from: owner});
    //     const amount = 15000;
    //     const delegationPeriod = 3;
    //     await delegationController.delegate(
    //         1, amount, delegationPeriod, "D2 is even", {from: holder});
    //     const delegationId = 0;
    //     await delegationController.acceptPendingDelegation(delegationId, {from: owner});
    //     (await skaleToken.balanceOf(holder)).toNumber().should.be.equal(1e6);
    // });

    it("should allow to retrieve all tokens if ETOP registered along time ago", async () => {
        const lockupPeriod = 6;
        const fullPeriod = 15;
        const fullAmount = 4e6;
        const lockupAmount = 1e6;
        const vestPeriod = 2;
        const vestTime = 3;
        const startDate = getTimeAtDate(1, 9, 2018);
        const isUnvestedDelegatable = false;
        const saftRound = 1;
        // await ETOP.addVestingTerm(holder, startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, isCancelable, {from: owner});
        await ETOP.addVestingPlan(lockupPeriod, fullPeriod, vestPeriod, vestTime, isUnvestedDelegatable, {from: owner});
        await ETOP.connectHolderToPlan(holder, saftRound, startDate, fullAmount, lockupAmount, {from: owner});
        await ETOP.approveHolder({from: holder});
        await ETOP.startVesting(holder, {from: owner});
        const escrowAddress = await ETOP.getEscrowAddress(holder);
        const escrow = await VestingEscrow.at(escrowAddress);
        // await ETOP.retrieve({from: holder});
        (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount);
    });

    it("should operate with fractional payments", async () => {
        const lockupPeriod = 1;
        const fullPeriod = 4;
        const fullAmount = 2e6;
        const lockupAmount = 1e6;
        const vestPeriod = 2;
        const vestTime = 1;
        const startDate = await currentTime(web3);
        const isUnvestedDelegatable = false;
        const saftRound = 1;
        await ETOP.addVestingPlan(lockupPeriod, fullPeriod, vestPeriod, vestTime, isUnvestedDelegatable, {from: owner});
        await ETOP.connectHolderToPlan(holder, saftRound, startDate, fullAmount, lockupAmount, {from: owner});
        // await ETOP.addVestingTerm(holder, startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, isCancelable, {from: owner});
        await ETOP.approveHolder({from: holder});
        await ETOP.startVesting(holder, {from: owner});
        let lockedAmount = await ETOP.getLockedAmount(holder);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 7);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedAmount.toNumber().should.be.equal(fullAmount - lockupAmount);
        await skipTimeToDate(web3, 1, 8);
        lockedAmount = await ETOP.getLockedAmount(holder);
        let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(Math.round(fullAmount - lockupAmount - (fullAmount - lockupAmount) / ((fullPeriod - lockupPeriod) / vestTime)));
        await skipTimeToDate(web3, 1, 9);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - lockupAmount - Math.trunc(2 * (fullAmount - lockupAmount) / ((fullPeriod - lockupPeriod) / vestTime)));
        await skipTimeToDate(web3, 1, 10);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(0);
    });

    it("should correctly operate ETOP 4: one time payment", async () => {
        const lockupPeriod = 10;
        const fullPeriod = 10;
        const fullAmount = 2e6;
        const lockupAmount = 2e6;
        const vestPeriod = 2;
        const vestTime = 0;
        const startDate = await currentTime(web3);
        const isUnvestedDelegatable = false;
        const saftRound = 1;
        await ETOP.addVestingPlan(lockupPeriod, fullPeriod, vestPeriod, vestTime, isUnvestedDelegatable, {from: owner});
        await ETOP.connectHolderToPlan(holder, saftRound, startDate, fullAmount, lockupAmount, {from: owner});
        // await ETOP.addVestingTerm(holder, startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, isCancelable, {from: owner});
        await ETOP.approveHolder({from: holder});
        await ETOP.startVesting(holder, {from: owner});
        let lockedAmount = await ETOP.getLockedAmount(holder);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 7);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 8);
        lockedAmount = await ETOP.getLockedAmount(holder);
        let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 9);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 10);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 11);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 12);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 1);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 2);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 3);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 4);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(0);
    });

    it("should correctly operate ETOP 5: each month payment", async () => {
        const lockupPeriod = 1;
        const fullPeriod = 10;
        const fullAmount = 2e6;
        const lockupAmount = 2e5;
        const vestPeriod = 2;
        const vestTime = 1;
        const startDate = await currentTime(web3);
        const isUnvestedDelegatable = false;
        const saftRound = 1;
        await ETOP.addVestingPlan(lockupPeriod, fullPeriod, vestPeriod, vestTime, isUnvestedDelegatable, {from: owner});
        await ETOP.connectHolderToPlan(holder, saftRound, startDate, fullAmount, lockupAmount, {from: owner});
        // await ETOP.addVestingTerm(holder, startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, isCancelable, {from: owner});
        await ETOP.approveHolder({from: holder});
        await ETOP.startVesting(holder, {from: owner});
        let lockedAmount = await ETOP.getLockedAmount(holder);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 7);
        lockedAmount = await ETOP.getLockedAmount(holder);
        let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(fullAmount - lockupAmount);
        await skipTimeToDate(web3, 1, 8);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 2 * lockupAmount);
        await skipTimeToDate(web3, 1, 9);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 3 * lockupAmount);
        await skipTimeToDate(web3, 1, 10);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 4 * lockupAmount);
        await skipTimeToDate(web3, 1, 11);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 5 * lockupAmount);
        await skipTimeToDate(web3, 1, 12);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 6 * lockupAmount);
        await skipTimeToDate(web3, 1, 1);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 7 * lockupAmount);
        await skipTimeToDate(web3, 1, 2);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 8 * lockupAmount);
        await skipTimeToDate(web3, 1, 3);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 9 * lockupAmount);
        await skipTimeToDate(web3, 1, 4);
        lockedAmount = await ETOP.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 10 * lockupAmount);
        lockedAmount.toNumber().should.be.equal(0);
    });

    it("should correctly operate ETOP 6: only initial payment", async () => {
        const lockupPeriod = 0;
        const fullPeriod = 0;
        const fullAmount = 2e6;
        const lockupAmount = 2e6;
        const vestPeriod = 2;
        const vestTime = 0;
        const startDate = await currentTime(web3);
        const isUnvestedDelegatable = false;
        const saftRound = 1;
        await ETOP.addVestingPlan(lockupPeriod, fullPeriod, vestPeriod, vestTime, isUnvestedDelegatable, {from: owner});
        await ETOP.connectHolderToPlan(holder, saftRound, startDate, fullAmount, lockupAmount, {from: owner});
        // await ETOP.addVestingTerm(holder, startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, isCancelable, {from: owner});
        await ETOP.approveHolder({from: holder});
        await ETOP.startVesting(holder, {from: owner});
        const lockedAmount = await ETOP.getLockedAmount(holder);
        const lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(0);
    });

    describe("when ETOPs are registered at the past", async () => {
        const lockupPeriod = 6;
        const fullPeriod = 36;
        const fullAmount = 6e6;
        const lockupAmount = 1e6;
        const vestTime = 6;
        const vestPeriod = 2;
        const isUnvestedDelegatable = false;

        let startDate: number;

        beforeEach(async () => {
            const time = await currentTime(web3);
            const currentDate = new Date(time * 1000);
            const previousYear = currentDate.getFullYear() - 1;
            startDate = getTimeAtDate(1, 9, previousYear)
            // ETOP example 0
            const saftRound = 1;
            await ETOP.addVestingPlan(lockupPeriod, fullPeriod, vestPeriod, vestTime, isUnvestedDelegatable, {from: owner});
            await ETOP.connectHolderToPlan(holder, saftRound, startDate, fullAmount, lockupAmount, {from: owner});
            // await ETOP.addVestingTerm(holder, startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, isCancelable, {from: owner});
            await ETOP.approveHolder({from: holder});
            await ETOP.startVesting(holder, {from: owner});
        });

        it("should unlock tokens after lockup", async () => {
            const lockedAmount = await ETOP.getLockedAmount(holder);
            const lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            // ETOP 0 lockup amount unlocked
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(fullAmount - lockupAmount);
        });

        it("should be able to transfer token", async () => {
            const escrowAddress = await ETOP.getEscrowAddress(holder);
            const escrow = await VestingEscrow.at(escrowAddress);
            await escrow.retrieve({from: holder});
            (await skaleToken.balanceOf(holder)).toNumber().should.be.equal(lockupAmount);
            await skaleToken.transfer(holder1, "100", {from: holder});
            (await skaleToken.balanceOf(holder)).toNumber().should.be.equal(lockupAmount - 100);
            (await skaleToken.balanceOf(holder1)).toNumber().should.be.equal(100);
        });

        it("should not be able to transfer more than unlocked", async () => {
            const escrowAddress = await ETOP.getEscrowAddress(holder);
            const escrow = await VestingEscrow.at(escrowAddress);
            await escrow.retrieve({from: holder});
            (await skaleToken.balanceOf(holder)).toNumber().should.be.equal(lockupAmount);
            await skaleToken.transfer(holder1, "1000001", {from: holder}).should.be.eventually.rejectedWith("ERC777: transfer amount exceeds balance");
        });

        it("should unlock tokens first part after lockup", async () => {
            await skipTimeToDate(web3, 1, 9)
            const lockedAmount = await ETOP.getLockedAmount(holder);
            const lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.lessThan(fullAmount - lockupAmount);
        });
    });

    describe("when All ETOPs are registered", async () => {
        const lockupPeriod = 6;
        const fullPeriod = 36;
        const fullAmount = 6e6;
        const lockupAmount = 1e6;
        const vestTime = 6;
        const vestPeriod = 2; // month
        const isUnvestedDelegatable = false;
        const saftRound = 1;

        const lockupPeriod1 = 12;
        const fullPeriod1 = 15;
        const fullAmount1 = 1e6;
        const lockupAmount1 = 5e5;
        const vestTime1 = 3;
        const vestPeriod1 = 2; // month
        const isUnvestedDelegatable1 = false;
        const saftRound1 = 2;

        const lockupPeriod2 = 9;
        const fullPeriod2 = 15;
        const fullAmount2 = 1e6;
        const lockupAmount2 = 5e5;
        const vestTime2 = 6;
        const vestPeriod2 = 2; // month
        const isUnvestedDelegatable2 = false;
        const saftRound2 = 3;

        const lockupPeriod3 = 12;
        const fullPeriod3 = 36;
        const fullAmount3 = 36e6;
        const lockupAmount3 = 12e6;
        const vestTime3 = 1;
        const vestPeriod3 = 2; // month
        const isUnvestedDelegatable3 = false;
        const saftRound3 = 4;

        let startDate: number;

        beforeEach(async () => {
            startDate = await currentTime(web3);
            // ETOP example 0
            // await ETOP.addVestingTerm(holder, startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, isCancelable, {from: owner});
            await ETOP.addVestingPlan(lockupPeriod, fullPeriod, vestPeriod, vestTime, isUnvestedDelegatable, {from: owner});
            await ETOP.connectHolderToPlan(holder, saftRound, startDate, fullAmount, lockupAmount, {from: owner});
            await ETOP.approveHolder({from: holder});
            await ETOP.startVesting(holder, {from: owner});
            // ETOP example 1
            // await ETOP.addVestingTerm(holder1, startDate, lockupPeriod1, fullPeriod1, fullAmount1, lockupAmount1, vestPeriod1, isCancelable1, {from: owner});
            await ETOP.addVestingPlan(lockupPeriod1, fullPeriod1, vestPeriod1, vestTime1, isUnvestedDelegatable1, {from: owner});
            await ETOP.connectHolderToPlan(holder1, saftRound1, startDate, fullAmount1, lockupAmount1, {from: owner});
            await ETOP.approveHolder({from: holder1});
            await ETOP.startVesting(holder1, {from: owner});
            // ETOP example 2
            // await ETOP.addVestingTerm(holder2, startDate, lockupPeriod2, fullPeriod2, fullAmount2, lockupAmount2, vestPeriod2, isCancelable2, {from: owner});
            await ETOP.addVestingPlan(lockupPeriod2, fullPeriod2, vestPeriod2, vestTime2, isUnvestedDelegatable2, {from: owner});
            await ETOP.connectHolderToPlan(holder2, saftRound2, startDate, fullAmount2, lockupAmount2, {from: owner});
            await ETOP.approveHolder({from: holder2});
            await ETOP.startVesting(holder2, {from: owner});
            // ETOP example 3
            await ETOP.addVestingPlan(lockupPeriod3, fullPeriod3, vestPeriod3, vestTime3, isUnvestedDelegatable3, {from: owner});
            await ETOP.connectHolderToPlan(holder3, saftRound3, startDate, fullAmount3, lockupAmount3, {from: owner});
            await ETOP.approveHolder({from: holder3});
            await ETOP.startVesting(holder3, {from: owner});
        });

        it("should show balance of all ETOPs", async () => {
            let escrowAddress = await ETOP.getEscrowAddress(holder);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount);
            escrowAddress = await ETOP.getEscrowAddress(holder1);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount1);
            escrowAddress = await ETOP.getEscrowAddress(holder2);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount2);
            escrowAddress = await ETOP.getEscrowAddress(holder3);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount3);
        });

        it("should not transferable of ETOP 0", async () => {
            await skaleToken.transfer(hacker, "100", {from: holder}).should.be.eventually.rejectedWith("ERC777: transfer amount exceeds balance");
            await skaleToken.transfer(hacker, "100", {from: holder1}).should.be.eventually.rejectedWith("ERC777: transfer amount exceeds balance");
            await skaleToken.transfer(hacker, "100", {from: holder2}).should.be.eventually.rejectedWith("ERC777: transfer amount exceeds balance");
            await skaleToken.transfer(hacker, "100", {from: holder3}).should.be.eventually.rejectedWith("ERC777: transfer amount exceeds balance");
        });

        it("All tokens should be locked of all ETOPs", async () => {
            const lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            let lockedAmount = await ETOP.getLockedAmount(holder);
            lockedAmount.toNumber().should.be.equal(fullAmount);

            lockedAmount = await ETOP.getLockedAmount(holder1);
            lockedAmount.toNumber().should.be.equal(fullAmount1);

            lockedAmount = await ETOP.getLockedAmount(holder2);
            lockedAmount.toNumber().should.be.equal(fullAmount2);

            lockedAmount = await ETOP.getLockedAmount(holder3);
            lockedAmount.toNumber().should.be.equal(fullAmount3);
        });

        it("After 6 month", async () => {
            await skipTimeToDate(web3, 1, 12);

            let lockedAmount = await ETOP.getLockedAmount(holder);
            const lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            // ETOP 0 lockup amount unlocked
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(fullAmount - lockupAmount);

            lockedAmount = await ETOP.getLockedAmount(holder1);
            lockedAmount.toNumber().should.be.equal(fullAmount1);

            lockedAmount = await ETOP.getLockedAmount(holder2);
            lockedAmount.toNumber().should.be.equal(fullAmount2);

            lockedAmount = await ETOP.getLockedAmount(holder3);
            lockedAmount.toNumber().should.be.equal(fullAmount3);
        });

        it("After 9 month", async () => {
            await skipTimeToDate(web3, 1, 3);
            let lockedAmount = await ETOP.getLockedAmount(holder);
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            // ETOP 0 only lockup amount unlocked
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(fullAmount - lockupAmount);

            lockedAmount = await ETOP.getLockedAmount(holder1);
            lockedAmount.toNumber().should.be.equal(fullAmount1);

            // ETOP 2 lockup amount unlocked
            lockedAmount = await ETOP.getLockedAmount(holder2);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod2, fullPeriod2, fullAmount2, lockupAmount2, vestPeriod2, vestTime2);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(fullAmount2 - lockupAmount2);

            lockedAmount = await ETOP.getLockedAmount(holder3);
            lockedAmount.toNumber().should.be.equal(fullAmount3);
        });

        it("After 12 month", async () => {
            await skipTimeToDate(web3, 1, 12);
            await skipTimeToDate(web3, 1, 6);

            let lockedAmount = await ETOP.getLockedAmount(holder);
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.lessThan(fullAmount - lockupAmount);

            // ETOP 1 lockup amount unlocked
            lockedAmount = await ETOP.getLockedAmount(holder1);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod1, fullPeriod1, fullAmount1, lockupAmount1, vestPeriod1, vestTime1);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(fullAmount1 - lockupAmount1);

            // ETOP 2 lockup amount unlocked
            lockedAmount = await ETOP.getLockedAmount(holder2);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod2, fullPeriod2, fullAmount2, lockupAmount2, vestPeriod2, vestTime2);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(fullAmount2 - lockupAmount2);

            // ETOP 3 lockup amount unlocked
            lockedAmount = await ETOP.getLockedAmount(holder3);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod3, fullPeriod3, fullAmount3, lockupAmount3, vestPeriod3, vestTime3);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(fullAmount3 - lockupAmount3);
        });

        it("should be possible to send tokens", async () => {
            await skipTimeToDate(web3, 1, 12);
            await skipTimeToDate(web3, 1, 6);
            let escrowAddress = await ETOP.getEscrowAddress(holder);
            let escrow = await VestingEscrow.at(escrowAddress);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount);
            await escrow.retrieve({from: holder});
            escrowAddress = await ETOP.getEscrowAddress(holder1);
            escrow = await VestingEscrow.at(escrowAddress);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount1);
            await escrow.retrieve({from: holder1});
            escrowAddress = await ETOP.getEscrowAddress(holder2);
            escrow = await VestingEscrow.at(escrowAddress);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount2);
            await escrow.retrieve({from: holder2});
            escrowAddress = await ETOP.getEscrowAddress(holder3);
            escrow = await VestingEscrow.at(escrowAddress);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount3);
            await escrow.retrieve({from: holder3});
            await skaleToken.transfer(hacker, "100", {from: holder});
            await skaleToken.transfer(hacker, "100", {from: holder1});
            await skaleToken.transfer(hacker, "100", {from: holder2});
            await skaleToken.transfer(hacker, "100", {from: holder3});
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            (await skaleToken.balanceOf(holder)).toNumber().should.be.equal(fullAmount - lockedCalculatedAmount - 100);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod1, fullPeriod1, fullAmount1, lockupAmount1, vestPeriod1, vestTime1);
            (await skaleToken.balanceOf(holder1)).toNumber().should.be.equal(fullAmount1 - lockedCalculatedAmount - 100);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod2, fullPeriod2, fullAmount2, lockupAmount2, vestPeriod2, vestTime2);
            (await skaleToken.balanceOf(holder2)).toNumber().should.be.equal(fullAmount2 - lockedCalculatedAmount - 100);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod3, fullPeriod3, fullAmount3, lockupAmount3, vestPeriod3, vestTime3);
            (await skaleToken.balanceOf(holder3)).toNumber().should.be.equal(fullAmount3 - lockedCalculatedAmount - 100);
            (await skaleToken.balanceOf(hacker)).toNumber().should.be.equal(400);
        });

        it("After 15 month", async () => {
            await skipTimeToDate(web3, 1, 3);
            await skipTimeToDate(web3, 1, 9);

            let lockedAmount = await ETOP.getLockedAmount(holder);
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.lessThan(fullAmount - lockupAmount);

            // ETOP 1 unlocked all tokens
            lockedAmount = await ETOP.getLockedAmount(holder1);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod1, fullPeriod1, fullAmount1, lockupAmount1, vestPeriod1, vestTime1);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(0);

            // ETOP 2 unlocked all tokens
            lockedAmount = await ETOP.getLockedAmount(holder2);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod2, fullPeriod2, fullAmount2, lockupAmount2, vestPeriod2, vestTime2);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(0);

            lockedAmount = await ETOP.getLockedAmount(holder3);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod3, fullPeriod3, fullAmount3, lockupAmount3, vestPeriod3, vestTime3);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.lessThan(fullAmount3 - lockupAmount3);
        });

        it("After 16, 17, 18 month", async () => {
            let saft0unlocked16: number;
            let saft0unlocked17: number;
            let saft0unlocked18: number;
            let saft3unlocked16: number;
            let saft3unlocked17: number;
            let saft3unlocked18: number;

            await skipTimeToDate(web3, 1, 5);
            await skipTimeToDate(web3, 1, 10);

            let lockedAmount = await ETOP.getLockedAmount(holder);
            saft0unlocked16 = lockedAmount.toNumber();
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);

            lockedAmount = await ETOP.getLockedAmount(holder3);
            saft3unlocked16 = lockedAmount.toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod3, fullPeriod3, fullAmount3, lockupAmount3, vestPeriod3, vestTime3);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);

            await skipTimeToDate(web3, 1, 11);

            lockedAmount = await ETOP.getLockedAmount(holder);
            saft0unlocked17 = lockedAmount.toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);

            lockedAmount = await ETOP.getLockedAmount(holder3);
            saft3unlocked17 = lockedAmount.toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod3, fullPeriod3, fullAmount3, lockupAmount3, vestPeriod3, vestTime3);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);

            saft0unlocked16.should.be.equal(saft0unlocked17);

            await skipTimeToDate(web3, 1, 12);

            lockedAmount = await ETOP.getLockedAmount(holder);
            saft0unlocked18 = lockedAmount.toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);

            lockedAmount = await ETOP.getLockedAmount(holder3);
            saft3unlocked18 = lockedAmount.toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod3, fullPeriod3, fullAmount3, lockupAmount3, vestPeriod3, vestTime3);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);

            (saft3unlocked16 - saft3unlocked17).should.be.equal(saft3unlocked17 - saft3unlocked18);

            saft0unlocked18.should.be.lessThan(saft0unlocked17);
        });

        it("After 24, 30, 36 month", async () => {
            let saft0unlocked24: number;
            let saft0unlocked30: number;
            let saft0unlocked36: number;

            await skipTimeToDate(web3, 1, 5);
            await skipTimeToDate(web3, 1, 4);
            await skipTimeToDate(web3, 1, 6);

            let lockedAmount = await ETOP.getLockedAmount(holder);
            saft0unlocked24 = lockedAmount.toNumber();
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);

            lockedAmount = await ETOP.getLockedAmount(holder3);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod3, fullPeriod3, fullAmount3, lockupAmount3, vestPeriod3, vestTime3);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);

            await skipTimeToDate(web3, 1, 12);

            lockedAmount = await ETOP.getLockedAmount(holder);
            saft0unlocked30 = lockedAmount.toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);

            lockedAmount = await ETOP.getLockedAmount(holder3);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod3, fullPeriod3, fullAmount3, lockupAmount3, vestPeriod3, vestTime3);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);

            await skipTimeToDate(web3, 1, 6);

            lockedAmount = await ETOP.getLockedAmount(holder);
            saft0unlocked36 = lockedAmount.toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(0);

            lockedAmount = await ETOP.getLockedAmount(holder3);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod3, fullPeriod3, fullAmount3, lockupAmount3, vestPeriod3, vestTime3);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(0);

            (saft0unlocked24 - saft0unlocked30).should.be.equal(saft0unlocked30 - saft0unlocked36);
        });
    });
});
