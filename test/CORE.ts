import { ContractManagerInstance,
    // DelegationControllerInstance,
    SkaleTokenTesterInstance,
    // ValidatorServiceInstance,
    COREInstance,
    COREEscrowContract,
    COREEscrowInstance,
    DistributorMockContract} from "./../types/truffle-contracts";

const COREEscrow: COREEscrowContract = artifacts.require("./COREEscrow");

import { calculateLockedAmount } from "./tools/vestingCalculation";
import { currentTime, getTimeAtDate, skipTimeToDate } from "./tools/time";

import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { deployContractManager } from "./tools/deploy/contractManager";
// import { deployDelegationController } from "../tools/deploy/delegation/delegationController";
// import { deployValidatorService } from "../tools/deploy/delegation/validatorService";
import { deployCORE } from "./tools/deploy/core";
import { deploySkaleTokenTester } from "./tools/deploy/test/skaleTokenTester";
import { HolderStatus } from "./tools/types";
chai.should();
chai.use(chaiAsPromised);

contract("CORE", ([owner, holder, holder1, holder2, holder3, hacker]) => {
    let contractManager: ContractManagerInstance;
    let skaleToken: SkaleTokenTesterInstance;
    // let validatorService: ValidatorServiceInstance;
    let CORE: COREInstance;
    // let delegationController: DelegationControllerInstance;

    beforeEach(async () => {
        contractManager = await deployContractManager(owner);
        skaleToken = await deploySkaleTokenTester(contractManager);
        // validatorService = await deployValidatorService(contractManager);
        // delegationController = await deployDelegationController(contractManager);
        CORE = await deployCORE(contractManager);

        // each test will start from July 1
        await skipTimeToDate(web3, 1, 6);
        await skaleToken.mint(CORE.address, 1e9, "0x", "0x");
    });

    it("should register CORE holder", async () => {
        (await CORE.isHolderRegistered(holder)).should.be.eq(false);
        await CORE.addCORE(6, 36, 2, 6, false, {from: owner});
        await CORE.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner});
        (await CORE.isHolderRegistered(holder)).should.be.eq(true);
        (await CORE.isApprovedHolder(holder)).should.be.eq(false);
        (await CORE.isActiveVestingTerm(holder)).should.be.eq(false);
    });

    it("should get CORE data", async () => {
        (await CORE.isHolderRegistered(holder)).should.be.eq(false);
        await CORE.addCORE(6, 36, 2, 6, false, {from: owner});
        await CORE.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner});
        (await CORE.isHolderRegistered(holder)).should.be.eq(true);
        ((await CORE.getStartVestingTime(holder)).toNumber()).should.be.equal(getTimeAtDate(1, 6, 2020));
        ((await CORE.getVestingCliffInMonth(holder)).toNumber()).should.be.equal(6);
        ((await CORE.getLockupPeriodTimestamp(holder)).toNumber()).should.be.equal(getTimeAtDate(1, 0, 2021));
        (await CORE.isUnvestedDelegatableTerm(holder)).should.be.equal(false);
        ((await CORE.getFinishVestingTime(holder)).toNumber()).should.be.equal(getTimeAtDate(1, 6, 2023));
        const plan = await CORE.getPlan(1);
        plan.fullPeriod.should.be.equal('36');
        plan.vestingCliffPeriod.should.be.equal('6');
        plan.vestingPeriod.should.be.equal('1');
        plan.regularPaymentTime.should.be.equal('6');
        plan.isUnvestedDelegatable.should.be.equal(false);
        const holderParams = await CORE.getHolderParams(holder);
        web3.utils.toBN(holderParams.status).toNumber().should.be.equal(HolderStatus.CONFIRMATION_PENDING);
        holderParams.planId.should.be.equal('1');
        holderParams.startVestingTime.should.be.equal(getTimeAtDate(1, 6, 2020).toString());
        holderParams.fullAmount.should.be.equal('1000000');
        holderParams.afterLockupAmount.should.be.equal('100000');
    });

    it("should approve CORE", async () => {
        (await CORE.isHolderRegistered(holder)).should.be.eq(false);
        await CORE.addCORE(6, 36, 2, 6, false, {from: owner});
        await CORE.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner});
        (await CORE.isHolderRegistered(holder)).should.be.eq(true);
        (await CORE.isApprovedHolder(holder)).should.be.eq(false);
        await CORE.approveHolder({from: holder});
        (await CORE.isApprovedHolder(holder)).should.be.eq(true);
        (await CORE.isActiveVestingTerm(holder)).should.be.eq(false);
    });

    it("should not approve CORE from hacker", async () => {
        (await CORE.isHolderRegistered(holder)).should.be.eq(false);
        await CORE.addCORE(6, 36, 2, 6, false, {from: owner});
        await CORE.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner});
        (await CORE.isHolderRegistered(holder)).should.be.eq(true);
        (await CORE.isApprovedHolder(holder)).should.be.eq(false);
        await CORE.approveHolder({from: hacker}).should.be.eventually.rejectedWith("Holder is not registered");
        (await CORE.isApprovedHolder(holder)).should.be.eq(false);
        (await CORE.isActiveVestingTerm(holder)).should.be.eq(false);
    });

    it("should not approve CORE twice", async () => {
        (await CORE.isHolderRegistered(holder)).should.be.eq(false);
        await CORE.addCORE(6, 36, 2, 6, false, {from: owner});
        await CORE.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner});
        (await CORE.isHolderRegistered(holder)).should.be.eq(true);
        (await CORE.isApprovedHolder(holder)).should.be.eq(false);
        await CORE.approveHolder({from: holder});
        (await CORE.isApprovedHolder(holder)).should.be.eq(true);
        (await CORE.isActiveVestingTerm(holder)).should.be.eq(false);
        await CORE.approveHolder({from: holder}).should.be.eventually.rejectedWith("Holder is already approved");
    });

    it("should not start vesting without approve CORE", async () => {
        (await CORE.isHolderRegistered(holder)).should.be.eq(false);
        await CORE.addCORE(6, 36, 2, 6, false, {from: owner});
        await CORE.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner});
        (await CORE.isHolderRegistered(holder)).should.be.eq(true);
        (await CORE.isApprovedHolder(holder)).should.be.eq(false);
        await CORE.startVesting(holder, {from: owner}).should.be.eventually.rejectedWith("Holder address is not confirmed");
        (await CORE.isApprovedHolder(holder)).should.be.eq(false);
        (await CORE.isActiveVestingTerm(holder)).should.be.eq(false);
    });

    it("should not start vesting without registering CORE", async () => {
        (await CORE.isHolderRegistered(holder)).should.be.eq(false);
        await CORE.startVesting(holder, {from: owner}).should.be.eventually.rejectedWith("Holder address is not confirmed");
        (await CORE.isHolderRegistered(holder)).should.be.eq(false);
        (await CORE.isApprovedHolder(holder)).should.be.eq(false);
        (await CORE.isActiveVestingTerm(holder)).should.be.eq(false);
    });

    it("should start vesting with register & approve CORE", async () => {
        (await CORE.isHolderRegistered(holder)).should.be.eq(false);
        await CORE.addCORE(6, 36, 2, 6, false, {from: owner});
        await CORE.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner});
        (await CORE.isHolderRegistered(holder)).should.be.eq(true);
        (await CORE.isApprovedHolder(holder)).should.be.eq(false);
        await CORE.approveHolder({from: holder});
        (await CORE.isApprovedHolder(holder)).should.be.eq(true);
        (await CORE.isActiveVestingTerm(holder)).should.be.eq(false);
        await CORE.startVesting(holder, {from: owner});
        (await CORE.isActiveVestingTerm(holder)).should.be.eq(true);
    });

    // it("should stop cancelable vesting after start", async () => {
    //     (await CORE.isHolderRegistered(holder)).should.be.eq(false);
    //     await CORE.addVestingTerm(holder, getTimeAtDate(1, 6, 2020), 6, 36, 1e6, 1e5, 6, true, {from: owner});
    //     (await CORE.isHolderRegistered(holder)).should.be.eq(true);
    //     (await CORE.isApprovedHolder(holder)).should.be.eq(false);
    //     await CORE.approveHolder({from: holder});
    //     (await CORE.isApprovedHolder(holder)).should.be.eq(true);
    //     (await CORE.isActiveVestingTerm(holder)).should.be.eq(false);
    //     await CORE.startVesting(holder, {from: owner});
    //     (await CORE.isActiveVestingTerm(holder)).should.be.eq(true);
    //     await CORE.stopVesting(holder, {from: owner});
    //     (await CORE.isActiveVestingTerm(holder)).should.be.eq(false);
    //     await CORE.startVesting(holder, {from: owner}).should.be.eventually.rejectedWith("CORE is already canceled");
    //     (await CORE.isActiveVestingTerm(holder)).should.be.eq(false);
    // });

    // it("should stop not-cancelable vesting before start", async () => {
    //     (await CORE.isHolderRegistered(holder)).should.be.eq(false);
    //     await CORE.addVestingTerm(holder, getTimeAtDate(1, 6, 2020), 6, 36, 1e6, 1e5, 6, false, {from: owner});
    //     (await CORE.isHolderRegistered(holder)).should.be.eq(true);
    //     (await CORE.isApprovedHolder(holder)).should.be.eq(false);
    //     await CORE.approveHolder({from: holder});
    //     (await CORE.isApprovedHolder(holder)).should.be.eq(true);
    //     (await CORE.isActiveVestingTerm(holder)).should.be.eq(false);
    //     await CORE.stopVesting(holder, {from: owner});
    //     await CORE.startVesting(holder, {from: owner}).should.be.eventually.rejectedWith("CORE is already canceled");
    //     (await CORE.isActiveVestingTerm(holder)).should.be.eq(false);
    // });

    // it("should not stop not-cancelable vesting before start", async () => {
    //     (await CORE.isHolderRegistered(holder)).should.be.eq(false);
    //     await CORE.addVestingTerm(holder, getTimeAtDate(1, 6, 2020), 6, 36, 1e6, 1e5, 6, false, {from: owner});
    //     (await CORE.isHolderRegistered(holder)).should.be.eq(true);
    //     (await CORE.isApprovedHolder(holder)).should.be.eq(false);
    //     await CORE.approveHolder({from: holder});
    //     (await CORE.isApprovedHolder(holder)).should.be.eq(true);
    //     (await CORE.isActiveVestingTerm(holder)).should.be.eq(false);
    //     await CORE.startVesting(holder, {from: owner});
    //     (await CORE.isActiveVestingTerm(holder)).should.be.eq(true);
    //     await CORE.stopVesting(holder, {from: owner}).should.be.eventually.rejectedWith("You could not stop vesting for holder");
    //     (await CORE.isActiveVestingTerm(holder)).should.be.eq(true);
    // });

    it("should not register CORE Plan if sender is not owner", async () => {
        await CORE.addCORE(6, 36, 2, 6, false, {from: hacker}).should.be.eventually.rejectedWith("Caller is not the owner");
        // await CORE.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner});
        // await CORE.addVestingTerm(holder, getTimeAtDate(1, 6, 2020), 6, 36, 1e6, 1e5, 6, false, {from: hacker}).should.be.eventually.rejectedWith("Ownable: caller is not the owner");
    });

    it("should not connect holder to Plan  if sender is not owner", async () => {
        await CORE.addCORE(6, 36, 2, 6, false, {from: owner});
        await CORE.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: hacker}).should.be.eventually.rejectedWith("Caller is not the owner");
        // await CORE.addVestingTerm(holder, getTimeAtDate(1, 6, 2020), 6, 36, 1e6, 1e5, 6, false, {from: hacker}).should.be.eventually.rejectedWith("Ownable: caller is not the owner");
    });

    it("should not register already registered CORE holder", async () => {
        await CORE.addCORE(6, 36, 2, 6, false, {from: owner});
        await CORE.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner});
        await CORE.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner}).should.be.eventually.rejectedWith("Holder is already added");
        await CORE.addCORE(6, 36, 2, 6, false, {from: owner});
        await CORE.connectHolderToPlan(holder, 2, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner}).should.be.eventually.rejectedWith("Holder is already added");
        // await CORE.addVestingTerm(holder, getTimeAtDate(1, 6, 2020), 6, 36, 1e6, 1e5, 6, false, {from: owner});
        // await CORE.addVestingTerm(holder, getTimeAtDate(1, 6, 2020), 6, 36, 1e6, 1e5, 6, false, {from: owner}).should.be.eventually.rejectedWith("CORE holder is already added");
    });

    it("should not register CORE Plan if periods incorrect", async () => {
        await CORE.addCORE(37, 36, 2, 6, false, {from: owner}).should.be.eventually.rejectedWith("Cliff period exceeds full period");
    });

    it("should not register CORE Plan if vesting times incorrect", async () => {
        await CORE.addCORE(6, 36, 2, 7, false, {from: owner}).should.be.eventually.rejectedWith("Incorrect vesting times");
    });

    it("should not connect holder to CORE Plan if amounts incorrect", async () => {
        await CORE.addCORE(6, 36, 2, 6, false, {from: owner});
        await CORE.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e5, 1e6, {from: owner}).should.be.eventually.rejectedWith("Incorrect amounts");
    });

    // it("should not connect holder to CORE Plan if period starts incorrect", async () => {
    //     const time = await currentTime(web3);
    //     const currentDate = new Date(time * 1000);
    //     const nextYear = currentDate.getFullYear() + 1;
    //     await CORE.addCORE(6, 36, 2, 6, false, {from: owner});
    //     await CORE.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, nextYear), 1e6, 1e5, {from: owner}).should.be.eventually.rejectedWith("Incorrect period starts");
    //     // await CORE.addVestingTerm(holder, getTimeAtDate(1, 6, nextYear), 6, 36, 1e6, 1e5, 6, false, {from: owner}).should.be.eventually.rejectedWith("Incorrect period starts");
    // });

    it("should be possible to delegate CORE tokens", async () => {
        await CORE.addCORE(6, 36, 2, 6, false, {from: owner});
        await CORE.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner})
        await CORE.approveHolder({from: holder});
        await CORE.startVesting(holder, {from: owner});
        const escrowAddress = await CORE.getEscrowAddress(holder);
        (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(1e6);
        const escrow = await COREEscrow.at(escrowAddress);
        const amount = 15000;
        const delegationPeriod = 3;
        await escrow.delegate(
            1, amount, delegationPeriod, "D2 is even", {from: holder});
        (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(1e6);
        (await skaleToken.getAndUpdateLockedAmount.call(escrowAddress)).toNumber().should.be.equal(amount);
    });

    describe("when holder delegated CORE tokens", async () => {
        let delegationId: number;
        let escrow: COREEscrowInstance;
        const delegatedAmount = 15000;

        beforeEach(async () => {
            await CORE.addCORE(6, 36, 2, 6, false, {from: owner});
            await CORE.connectHolderToPlan(holder, 1, getTimeAtDate(1, 6, 2020), 1e6, 1e5, {from: owner})
            await CORE.approveHolder({from: holder});
            await CORE.startVesting(holder, {from: owner});
            const escrowAddress = await CORE.getEscrowAddress(holder);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(1e6);
            escrow = (await COREEscrow.at(escrowAddress)) as COREEscrowInstance;
            const delegationPeriod = 3;
            await escrow.delegate(
                1, delegatedAmount, delegationPeriod, "D2 is even", {from: holder});
            delegationId = 0;
        });

        it("should be able to undelegate CORE tokens", async () => {
            await escrow.requestUndelegation(delegationId, {from: holder});
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
            await escrow.withdrawBounty(validatorId, holder, {from: holder});
            (await skaleToken.balanceOf(holder)).toNumber().should.be.equal(bounty);
        });
    });

    it("should allow to retrieve all tokens if CORE registered along time ago", async () => {
        const lockupPeriod = 6;
        const fullPeriod = 15;
        const fullAmount = 4e6;
        const lockupAmount = 1e6;
        const vestPeriod = 2;
        const vestTime = 3;
        const startDate = getTimeAtDate(1, 9, 2018);
        const isUnvestedDelegatable = false;
        const saftRound = 1;
        // await CORE.addVestingTerm(holder, startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, isCancelable, {from: owner});
        await CORE.addCORE(lockupPeriod, fullPeriod, vestPeriod, vestTime, isUnvestedDelegatable, {from: owner});
        await CORE.connectHolderToPlan(holder, saftRound, startDate, fullAmount, lockupAmount, {from: owner});
        await CORE.approveHolder({from: holder});
        await CORE.startVesting(holder, {from: owner});
        const escrowAddress = await CORE.getEscrowAddress(holder);
        const escrow = await COREEscrow.at(escrowAddress);
        // await CORE.retrieve({from: holder});
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
        await CORE.addCORE(lockupPeriod, fullPeriod, vestPeriod, vestTime, isUnvestedDelegatable, {from: owner});
        await CORE.connectHolderToPlan(holder, saftRound, startDate, fullAmount, lockupAmount, {from: owner});
        // await CORE.addVestingTerm(holder, startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, isCancelable, {from: owner});
        await CORE.approveHolder({from: holder});
        await CORE.startVesting(holder, {from: owner});
        let lockedAmount = await CORE.getLockedAmount(holder);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 7);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedAmount.toNumber().should.be.equal(fullAmount - lockupAmount);
        await skipTimeToDate(web3, 1, 8);
        lockedAmount = await CORE.getLockedAmount(holder);
        let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(Math.round(fullAmount - lockupAmount - (fullAmount - lockupAmount) / ((fullPeriod - lockupPeriod) / vestTime)));
        await skipTimeToDate(web3, 1, 9);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - lockupAmount - Math.trunc(2 * (fullAmount - lockupAmount) / ((fullPeriod - lockupPeriod) / vestTime)));
        await skipTimeToDate(web3, 1, 10);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(0);
    });

    it("should correctly operate CORE 4: one time payment", async () => {
        const lockupPeriod = 10;
        const fullPeriod = 10;
        const fullAmount = 2e6;
        const lockupAmount = 2e6;
        const vestPeriod = 2;
        const vestTime = 0;
        const startDate = await currentTime(web3);
        const isUnvestedDelegatable = false;
        const saftRound = 1;
        await CORE.addCORE(lockupPeriod, fullPeriod, vestPeriod, vestTime, isUnvestedDelegatable, {from: owner});
        await CORE.connectHolderToPlan(holder, saftRound, startDate, fullAmount, lockupAmount, {from: owner});
        // await CORE.addVestingTerm(holder, startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, isCancelable, {from: owner});
        await CORE.approveHolder({from: holder});
        await CORE.startVesting(holder, {from: owner});
        let lockedAmount = await CORE.getLockedAmount(holder);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 7);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 8);
        lockedAmount = await CORE.getLockedAmount(holder);
        let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 9);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 10);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 11);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 12);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 1);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 2);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 3);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        await skipTimeToDate(web3, 1, 4);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(0);
    });

    it("should correctly operate CORE 5: each month payment", async () => {
        const lockupPeriod = 1;
        const fullPeriod = 10;
        const fullAmount = 2e6;
        const lockupAmount = 2e5;
        const vestPeriod = 2;
        const vestTime = 1;
        const startDate = await currentTime(web3);
        const isUnvestedDelegatable = false;
        const saftRound = 1;
        const initDate = new Date(startDate * 1000);
        await CORE.addCORE(lockupPeriod, fullPeriod, vestPeriod, vestTime, isUnvestedDelegatable, {from: owner});
        await CORE.connectHolderToPlan(holder, saftRound, startDate, fullAmount, lockupAmount, {from: owner});
        // await CORE.addVestingTerm(holder, startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, isCancelable, {from: owner});
        await CORE.approveHolder({from: holder});
        await CORE.startVesting(holder, {from: owner});
        let lockedAmount = await CORE.getLockedAmount(holder);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 7);
        lockedAmount = await CORE.getLockedAmount(holder);
        let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(fullAmount - lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 8);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 2 * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 9);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 3 * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 10);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 4 * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 11);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 5 * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 12);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 6 * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 1);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 7 * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 2);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 8 * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 3);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 9 * lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 4);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 10 * lockupAmount);
        lockedAmount.toNumber().should.be.equal(0);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
    });

    it("should correctly operate CORE 5: each 1 day payment", async () => {
        const lockupPeriod = 1;
        const fullPeriod = 2;
        const fullAmount = 2e6;
        const lockupAmount = 2e5;
        const vestPeriod = 1;
        const vestTime = 1;
        const startDate = await currentTime(web3);
        const isUnvestedDelegatable = false;
        const saftRound = 1;
        const initDate = new Date(startDate * 1000);
        await CORE.addCORE(lockupPeriod, fullPeriod, vestPeriod, vestTime, isUnvestedDelegatable, {from: owner});
        await CORE.connectHolderToPlan(holder, saftRound, startDate, fullAmount, lockupAmount, {from: owner});
        // await CORE.addVestingTerm(holder, startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, isCancelable, {from: owner});
        await CORE.approveHolder({from: holder});
        await CORE.startVesting(holder, {from: owner});
        let lockedAmount = await CORE.getLockedAmount(holder);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        // let timeOfNextPayment = await CORE.getTimeOfNextVest(holder);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        // initDate.setUTCDate(initDate.getUTCDay() + vestTime);
        // console.log("Now:", initDate.getTime() / 1000);
        // console.log("Payment:", (await CORE.getTimeOfNextVest(holder)).toString());
        // console.log("");
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        // console.log("Passed!!!!!!");
        await skipTimeToDate(web3, 1, 7);
        lockedAmount = await CORE.getLockedAmount(holder);
        let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(fullAmount - lockupAmount);
        initDate.setUTCDate(initDate.getUTCDate() + vestTime);
        // console.log("");
        // console.log("Now:", initDate.getTime() / 1000);
        // console.log("Payment:", (await CORE.getTimeOfNextVest(holder)).toString());
        // console.log("");
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 2, 7);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        // lockedAmount.toNumber().should.be.equal(fullAmount - 2 * lockupAmount);
        // timeOfNextPayment = await CORE.getTimeOfNextVest(holder);
        // initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        initDate.setUTCDate(initDate.getUTCDate() + vestTime);
        // console.log("");
        // console.log("Now:", initDate.getTime() / 1000);
        // console.log("Current time:", await currentTime(web3));
        // console.log("Payment:", (await CORE.getTimeOfNextVest(holder)).toString());
        // console.log("");
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 3, 7);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        // lockedAmount.toNumber().should.be.equal(fullAmount - 3 * lockupAmount);
        // timeOfNextPayment = await CORE.getTimeOfNextVest(holder);
        initDate.setUTCDate(initDate.getUTCDate() + vestTime);
        // initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 4, 7);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        // lockedAmount.toNumber().should.be.equal(fullAmount - 4 * lockupAmount);
        // timeOfNextPayment = await CORE.getTimeOfNextVest(holder);
        initDate.setUTCDate(initDate.getUTCDate() + vestTime);
        // initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 5, 7);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        // lockedAmount.toNumber().should.be.equal(fullAmount - 5 * lockupAmount);
        // timeOfNextPayment = await CORE.getTimeOfNextVest(holder);
        initDate.setUTCDate(initDate.getUTCDate() + vestTime);
        // initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 6, 7);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        // lockedAmount.toNumber().should.be.equal(fullAmount - 6 * lockupAmount);
        // timeOfNextPayment = await CORE.getTimeOfNextVest(holder);
        initDate.setUTCDate(initDate.getUTCDate() + vestTime);
        // initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 7, 7);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        // lockedAmount.toNumber().should.be.equal(fullAmount - 7 * lockupAmount);
        // timeOfNextPayment = await CORE.getTimeOfNextVest(holder);
        initDate.setUTCDate(initDate.getUTCDate() + vestTime);
        // initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 8, 7);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        // lockedAmount.toNumber().should.be.equal(fullAmount - 8 * lockupAmount);
        // timeOfNextPayment = await CORE.getTimeOfNextVest(holder);
        initDate.setUTCDate(initDate.getUTCDate() + vestTime);
        // initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 9, 7);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        // lockedAmount.toNumber().should.be.equal(fullAmount - 9 * lockupAmount);
        // timeOfNextPayment = await CORE.getTimeOfNextVest(holder);
        initDate.setUTCDate(initDate.getUTCDate() + vestTime);
        // initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 10, 7);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        // lockedAmount.toNumber().should.be.equal(fullAmount - 10 * lockupAmount);
        // lockedAmount.toNumber().should.be.equal(0);
        // timeOfNextPayment = await CORE.getTimeOfNextVest(holder);
        initDate.setUTCDate(initDate.getUTCDate() + vestTime);
        // console.log("Hmmmm");
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        // console.log("OK");

        initDate.setUTCMonth(initDate.getUTCMonth() + 1, 1);
        // finish day
        await skipTimeToDate(web3, 1, 8);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        // lockedAmount.toNumber().should.be.equal(fullAmount - 10 * lockupAmount);
        lockedAmount.toNumber().should.be.equal(0);
        // timeOfNextPayment = await CORE.getTimeOfNextVest(holder);
        // initDate.setUTCDate(initDate.getUTCDate() + vestTime);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
    });

    it("should correctly operate CORE 5: each 1 year payment", async () => {
        const lockupPeriod = 12;
        const fullPeriod = 36;
        const fullAmount = 3e6;
        const lockupAmount = 1e6;
        const vestPeriod = 3;
        const vestTime = 1;
        const startDate = await currentTime(web3);
        const isUnvestedDelegatable = false;
        const saftRound = 1;
        const initDate = new Date(startDate * 1000);
        await CORE.addCORE(lockupPeriod, fullPeriod, vestPeriod, vestTime, isUnvestedDelegatable, {from: owner});
        await CORE.connectHolderToPlan(holder, saftRound, startDate, fullAmount, lockupAmount, {from: owner});
        // await CORE.addVestingTerm(holder, startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, isCancelable, {from: owner});
        await CORE.approveHolder({from: holder});
        await CORE.startVesting(holder, {from: owner});
        let lockedAmount = await CORE.getLockedAmount(holder);
        lockedAmount.toNumber().should.be.equal(fullAmount);
        // let timeOfNextPayment = await CORE.getTimeOfNextUnlock(holder);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + vestTime);
        // initDate.setUTCDate(initDate.getUTCDay() + vestTime);
        // console.log("Now:", initDate.getTime() / 1000);
        // console.log("Payment:", (await CORE.getTimeOfNextUnlock(holder)).toString());
        // console.log("");
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        // console.log("Passed!!!!!!");
        await skipTimeToDate(web3, 1, 5);
        await skipTimeToDate(web3, 1, 6);
        lockedAmount = await CORE.getLockedAmount(holder);
        let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(fullAmount - lockupAmount);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + vestTime);
        // console.log("");
        // console.log("Now:", initDate.getTime() / 1000);
        // console.log("Payment:", (await CORE.getTimeOfNextVest(holder)).toString());
        // console.log("");
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 5);
        await skipTimeToDate(web3, 1, 6);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        // console.log("LOckedAMount", lockedAmount.toNumber());
        // console.log("Locked calculated amount:", lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 2 * lockupAmount);
        // timeOfNextPayment = await CORE.getTimeOfNextVest(holder);
        // initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        initDate.setUTCFullYear(initDate.getUTCFullYear() + vestTime);
        // console.log("");
        // console.log("Now:", initDate.getTime() / 1000);
        // console.log("Current time:", await currentTime(web3));
        // console.log("Payment:", (await CORE.getTimeOfNextVest(holder)).toString());
        // console.log("");
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
        await skipTimeToDate(web3, 1, 5);
        await skipTimeToDate(web3, 1, 6);
        lockedAmount = await CORE.getLockedAmount(holder);
        lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
        lockedAmount.toNumber().should.be.equal(fullAmount - 3 * lockupAmount);
        lockedAmount.toNumber().should.be.equal(0);
        // timeOfNextPayment = await CORE.getTimeOfNextVest(holder);
        // initDate.setUTCDate(initDate.getUTCDate() + vestTime);
        // initDate.setUTCFullYear(initDate.getUTCFullYear() + (initDate.getUTCMonth() + 1) / 12, (initDate.getUTCMonth() + 1) % 12);
        (await CORE.getTimeOfNextVest(holder)).toString().should.be.equal((initDate.getTime() / 1000).toString());
    });

    it("should correctly operate CORE 6: only initial payment", async () => {
        const lockupPeriod = 0;
        const fullPeriod = 0;
        const fullAmount = 2e6;
        const lockupAmount = 2e6;
        const vestPeriod = 2;
        const vestTime = 0;
        const startDate = await currentTime(web3);
        const isUnvestedDelegatable = false;
        const saftRound = 1;
        await CORE.addCORE(lockupPeriod, fullPeriod, vestPeriod, vestTime, isUnvestedDelegatable, {from: owner});
        await CORE.connectHolderToPlan(holder, saftRound, startDate, fullAmount, lockupAmount, {from: owner});
        // await CORE.addVestingTerm(holder, startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, isCancelable, {from: owner});
        await CORE.approveHolder({from: holder});
        await CORE.startVesting(holder, {from: owner});
        const lockedAmount = await CORE.getLockedAmount(holder);
        const lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
        lockedAmount.toNumber().should.be.equal(0);
    });

    describe("when COREs are registered at the past", async () => {
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
            // CORE example 0
            const saftRound = 1;
            await CORE.addCORE(lockupPeriod, fullPeriod, vestPeriod, vestTime, isUnvestedDelegatable, {from: owner});
            await CORE.connectHolderToPlan(holder, saftRound, startDate, fullAmount, lockupAmount, {from: owner});
            // await CORE.addVestingTerm(holder, startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, isCancelable, {from: owner});
            await CORE.approveHolder({from: holder});
            await CORE.startVesting(holder, {from: owner});
        });

        it("should unlock tokens after lockup", async () => {
            const lockedAmount = await CORE.getLockedAmount(holder);
            const lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            // CORE 0 lockup amount unlocked
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(fullAmount - lockupAmount);
        });

        it("should be able to transfer token", async () => {
            const escrowAddress = await CORE.getEscrowAddress(holder);
            const escrow = await COREEscrow.at(escrowAddress);
            await escrow.retrieve({from: holder});
            (await skaleToken.balanceOf(holder)).toNumber().should.be.equal(lockupAmount);
            await skaleToken.transfer(holder1, "100", {from: holder});
            (await skaleToken.balanceOf(holder)).toNumber().should.be.equal(lockupAmount - 100);
            (await skaleToken.balanceOf(holder1)).toNumber().should.be.equal(100);
        });

        it("should not be able to transfer more than unlocked", async () => {
            const escrowAddress = await CORE.getEscrowAddress(holder);
            const escrow = await COREEscrow.at(escrowAddress);
            await escrow.retrieve({from: holder});
            (await skaleToken.balanceOf(holder)).toNumber().should.be.equal(lockupAmount);
            await skaleToken.transfer(holder1, "1000001", {from: holder}).should.be.eventually.rejectedWith("ERC777: transfer amount exceeds balance");
        });

        it("should unlock tokens first part after lockup", async () => {
            await skipTimeToDate(web3, 1, 9)
            const lockedAmount = await CORE.getLockedAmount(holder);
            const lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.lessThan(fullAmount - lockupAmount);
        });
    });

    describe("when All COREs are registered", async () => {
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
            // CORE example 0
            // await CORE.addVestingTerm(holder, startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, isCancelable, {from: owner});
            await CORE.addCORE(lockupPeriod, fullPeriod, vestPeriod, vestTime, isUnvestedDelegatable, {from: owner});
            await CORE.connectHolderToPlan(holder, saftRound, startDate, fullAmount, lockupAmount, {from: owner});
            await CORE.approveHolder({from: holder});
            await CORE.startVesting(holder, {from: owner});
            // CORE example 1
            // await CORE.addVestingTerm(holder1, startDate, lockupPeriod1, fullPeriod1, fullAmount1, lockupAmount1, vestPeriod1, isCancelable1, {from: owner});
            await CORE.addCORE(lockupPeriod1, fullPeriod1, vestPeriod1, vestTime1, isUnvestedDelegatable1, {from: owner});
            await CORE.connectHolderToPlan(holder1, saftRound1, startDate, fullAmount1, lockupAmount1, {from: owner});
            await CORE.approveHolder({from: holder1});
            await CORE.startVesting(holder1, {from: owner});
            // CORE example 2
            // await CORE.addVestingTerm(holder2, startDate, lockupPeriod2, fullPeriod2, fullAmount2, lockupAmount2, vestPeriod2, isCancelable2, {from: owner});
            await CORE.addCORE(lockupPeriod2, fullPeriod2, vestPeriod2, vestTime2, isUnvestedDelegatable2, {from: owner});
            await CORE.connectHolderToPlan(holder2, saftRound2, startDate, fullAmount2, lockupAmount2, {from: owner});
            await CORE.approveHolder({from: holder2});
            await CORE.startVesting(holder2, {from: owner});
            // CORE example 3
            await CORE.addCORE(lockupPeriod3, fullPeriod3, vestPeriod3, vestTime3, isUnvestedDelegatable3, {from: owner});
            await CORE.connectHolderToPlan(holder3, saftRound3, startDate, fullAmount3, lockupAmount3, {from: owner});
            await CORE.approveHolder({from: holder3});
            await CORE.startVesting(holder3, {from: owner});
        });

        it("should show balance of all COREs", async () => {
            let escrowAddress = await CORE.getEscrowAddress(holder);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount);
            escrowAddress = await CORE.getEscrowAddress(holder1);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount1);
            escrowAddress = await CORE.getEscrowAddress(holder2);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount2);
            escrowAddress = await CORE.getEscrowAddress(holder3);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount3);
        });

        it("should not transferable of CORE 0", async () => {
            await skaleToken.transfer(hacker, "100", {from: holder}).should.be.eventually.rejectedWith("ERC777: transfer amount exceeds balance");
            await skaleToken.transfer(hacker, "100", {from: holder1}).should.be.eventually.rejectedWith("ERC777: transfer amount exceeds balance");
            await skaleToken.transfer(hacker, "100", {from: holder2}).should.be.eventually.rejectedWith("ERC777: transfer amount exceeds balance");
            await skaleToken.transfer(hacker, "100", {from: holder3}).should.be.eventually.rejectedWith("ERC777: transfer amount exceeds balance");
        });

        it("All tokens should be locked of all COREs", async () => {
            const lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            let lockedAmount = await CORE.getLockedAmount(holder);
            lockedAmount.toNumber().should.be.equal(fullAmount);

            lockedAmount = await CORE.getLockedAmount(holder1);
            lockedAmount.toNumber().should.be.equal(fullAmount1);

            lockedAmount = await CORE.getLockedAmount(holder2);
            lockedAmount.toNumber().should.be.equal(fullAmount2);

            lockedAmount = await CORE.getLockedAmount(holder3);
            lockedAmount.toNumber().should.be.equal(fullAmount3);
        });

        it("After 6 month", async () => {
            await skipTimeToDate(web3, 1, 12);

            let lockedAmount = await CORE.getLockedAmount(holder);
            const lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            // CORE 0 lockup amount unlocked
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(fullAmount - lockupAmount);

            lockedAmount = await CORE.getLockedAmount(holder1);
            lockedAmount.toNumber().should.be.equal(fullAmount1);

            lockedAmount = await CORE.getLockedAmount(holder2);
            lockedAmount.toNumber().should.be.equal(fullAmount2);

            lockedAmount = await CORE.getLockedAmount(holder3);
            lockedAmount.toNumber().should.be.equal(fullAmount3);
        });

        it("After 9 month", async () => {
            await skipTimeToDate(web3, 1, 3);
            let lockedAmount = await CORE.getLockedAmount(holder);
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            // CORE 0 only lockup amount unlocked
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(fullAmount - lockupAmount);

            lockedAmount = await CORE.getLockedAmount(holder1);
            lockedAmount.toNumber().should.be.equal(fullAmount1);

            // CORE 2 lockup amount unlocked
            lockedAmount = await CORE.getLockedAmount(holder2);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod2, fullPeriod2, fullAmount2, lockupAmount2, vestPeriod2, vestTime2);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(fullAmount2 - lockupAmount2);

            lockedAmount = await CORE.getLockedAmount(holder3);
            lockedAmount.toNumber().should.be.equal(fullAmount3);
        });

        it("After 12 month", async () => {
            await skipTimeToDate(web3, 1, 12);
            await skipTimeToDate(web3, 1, 6);

            let lockedAmount = await CORE.getLockedAmount(holder);
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.lessThan(fullAmount - lockupAmount);

            // CORE 1 lockup amount unlocked
            lockedAmount = await CORE.getLockedAmount(holder1);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod1, fullPeriod1, fullAmount1, lockupAmount1, vestPeriod1, vestTime1);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(fullAmount1 - lockupAmount1);

            // CORE 2 lockup amount unlocked
            lockedAmount = await CORE.getLockedAmount(holder2);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod2, fullPeriod2, fullAmount2, lockupAmount2, vestPeriod2, vestTime2);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(fullAmount2 - lockupAmount2);

            // CORE 3 lockup amount unlocked
            lockedAmount = await CORE.getLockedAmount(holder3);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod3, fullPeriod3, fullAmount3, lockupAmount3, vestPeriod3, vestTime3);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(fullAmount3 - lockupAmount3);
        });

        it("should be possible to send tokens", async () => {
            await skipTimeToDate(web3, 1, 12);
            await skipTimeToDate(web3, 1, 6);
            let escrowAddress = await CORE.getEscrowAddress(holder);
            let escrow = await COREEscrow.at(escrowAddress);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount);
            await escrow.retrieve({from: holder});
            escrowAddress = await CORE.getEscrowAddress(holder1);
            escrow = await COREEscrow.at(escrowAddress);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount1);
            await escrow.retrieve({from: holder1});
            escrowAddress = await CORE.getEscrowAddress(holder2);
            escrow = await COREEscrow.at(escrowAddress);
            (await skaleToken.balanceOf(escrowAddress)).toNumber().should.be.equal(fullAmount2);
            await escrow.retrieve({from: holder2});
            escrowAddress = await CORE.getEscrowAddress(holder3);
            escrow = await COREEscrow.at(escrowAddress);
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

            let lockedAmount = await CORE.getLockedAmount(holder);
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.lessThan(fullAmount - lockupAmount);

            // CORE 1 unlocked all tokens
            lockedAmount = await CORE.getLockedAmount(holder1);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod1, fullPeriod1, fullAmount1, lockupAmount1, vestPeriod1, vestTime1);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(0);

            // CORE 2 unlocked all tokens
            lockedAmount = await CORE.getLockedAmount(holder2);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod2, fullPeriod2, fullAmount2, lockupAmount2, vestPeriod2, vestTime2);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(0);

            lockedAmount = await CORE.getLockedAmount(holder3);
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

            let lockedAmount = await CORE.getLockedAmount(holder);
            saft0unlocked16 = lockedAmount.toNumber();
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);

            lockedAmount = await CORE.getLockedAmount(holder3);
            saft3unlocked16 = lockedAmount.toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod3, fullPeriod3, fullAmount3, lockupAmount3, vestPeriod3, vestTime3);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);

            await skipTimeToDate(web3, 1, 11);

            lockedAmount = await CORE.getLockedAmount(holder);
            saft0unlocked17 = lockedAmount.toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);

            lockedAmount = await CORE.getLockedAmount(holder3);
            saft3unlocked17 = lockedAmount.toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod3, fullPeriod3, fullAmount3, lockupAmount3, vestPeriod3, vestTime3);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);

            saft0unlocked16.should.be.equal(saft0unlocked17);

            await skipTimeToDate(web3, 1, 12);

            lockedAmount = await CORE.getLockedAmount(holder);
            saft0unlocked18 = lockedAmount.toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);

            lockedAmount = await CORE.getLockedAmount(holder3);
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

            let lockedAmount = await CORE.getLockedAmount(holder);
            saft0unlocked24 = lockedAmount.toNumber();
            let lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);

            lockedAmount = await CORE.getLockedAmount(holder3);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod3, fullPeriod3, fullAmount3, lockupAmount3, vestPeriod3, vestTime3);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);

            await skipTimeToDate(web3, 1, 12);

            lockedAmount = await CORE.getLockedAmount(holder);
            saft0unlocked30 = lockedAmount.toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);

            lockedAmount = await CORE.getLockedAmount(holder3);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod3, fullPeriod3, fullAmount3, lockupAmount3, vestPeriod3, vestTime3);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);

            await skipTimeToDate(web3, 1, 6);

            lockedAmount = await CORE.getLockedAmount(holder);
            saft0unlocked36 = lockedAmount.toNumber();
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(0);

            lockedAmount = await CORE.getLockedAmount(holder3);
            lockedCalculatedAmount = calculateLockedAmount(await currentTime(web3), startDate, lockupPeriod3, fullPeriod3, fullAmount3, lockupAmount3, vestPeriod3, vestTime3);
            lockedAmount.toNumber().should.be.equal(lockedCalculatedAmount);
            lockedAmount.toNumber().should.be.equal(0);

            (saft0unlocked24 - saft0unlocked30).should.be.equal(saft0unlocked30 - saft0unlocked36);
        });
    });
});
