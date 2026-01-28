import { TimeUnit } from "./types";

function differenceInDays(date1: Date, date2: Date) {
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    return Math.floor((date2.getTime() - date1.getTime()) / MS_PER_DAY);
}

function differenceInMonths(date1: Date, date2: Date) {
    let months = (date2.getFullYear() - date1.getFullYear()) * 12;
    months -= date1.getMonth();
    months += date2.getMonth();
    return months <= 0 ? 0 : months;
}

function differenceInYears(date1: Date, date2: Date) {
    return date2.getFullYear() - date1.getFullYear();
}

export function calculateVestedAmount(
    currentTimestamp: bigint | number,
    startTimestamp: bigint | number,
    vestingCliff: bigint,
    totalVestingDuration: bigint,
    vestingIntervalTimeUnit: TimeUnit,
    vestingInterval: bigint,
    tokensAmount: bigint,
    tokensAmountAfterCliff: bigint): bigint {

    const begin = new Date(Number(startTimestamp) * 1000);
    if (begin.getUTCHours() !== 0 || begin.getUTCMinutes() !== 0 || begin.getUTCSeconds() !== 0 || begin.getUTCMilliseconds() !== 0) {
        throw Error("Start timestamp is not a beginning of a month");
    }

    const cliffEnd = new Date(begin);
    cliffEnd.setMonth(begin.getMonth() + Number(vestingCliff));

    const end = new Date(begin);
    end.setMonth(begin.getMonth() + Number(totalVestingDuration));

    const current = new Date(Number(currentTimestamp) * 1000);

    if (current < cliffEnd) {
        return 0n;
    } else if (current >= end) {
        return tokensAmount;
    } else {
        let totalIntervalsNumber: bigint;
        let passedIntervalsNumber: bigint;
        const vestingIntervalNum = Number(vestingInterval);
        if (vestingIntervalTimeUnit === TimeUnit.DAY) {
            totalIntervalsNumber = BigInt(Math.floor(differenceInDays(cliffEnd, end) / vestingIntervalNum));
            passedIntervalsNumber = BigInt(Math.floor(differenceInDays(cliffEnd, current <= end ? current : end) / vestingIntervalNum));
        } else if (vestingIntervalTimeUnit === TimeUnit.MONTH) {
            totalIntervalsNumber = BigInt(Math.floor(differenceInMonths(cliffEnd, end) / vestingIntervalNum));
            passedIntervalsNumber = BigInt(Math.floor(differenceInMonths(cliffEnd, current <= end ? current : end) / vestingIntervalNum));
        } else if (vestingIntervalTimeUnit === TimeUnit.YEAR) {
            totalIntervalsNumber = BigInt(Math.floor(differenceInYears(cliffEnd, end) / vestingIntervalNum));
            passedIntervalsNumber = BigInt(Math.floor(differenceInYears(cliffEnd, current <= end ? current : end) / vestingIntervalNum));
        } else {
            throw new Error("Unknown time unit");
        }
        if (totalIntervalsNumber > 0n) {
            return tokensAmountAfterCliff + (tokensAmount - tokensAmountAfterCliff) / totalIntervalsNumber * passedIntervalsNumber;
        } else {
            return tokensAmountAfterCliff;
        }
    }
}

export function calculateLockedAmount(time: number | bigint, startDate: number | bigint, lockupPeriod: bigint, fullPeriod: bigint, fullAmount: bigint, lockupAmount: bigint, vestPeriod: TimeUnit, vestTime: bigint): bigint {
    return fullAmount - calculateVestedAmount(time, startDate, lockupPeriod, fullPeriod, vestPeriod, vestTime, fullAmount, lockupAmount);
}
