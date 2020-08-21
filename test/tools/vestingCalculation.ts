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
    currentTimestamp: number,
    startTimestamp: number,
    vestingCliff: number,
    totalVestingDuration: number,
    vestingIntervalTimeUnit: TimeUnit,
    vestingInterval: number,
    tokensAmount: number,
    tokensAmountAfterCliff: number) {

        const begin = new Date(startTimestamp * 1000);
        if (begin.getUTCHours() !== 0 || begin.getUTCMinutes() !== 0 || begin.getUTCSeconds() !== 0 || begin.getUTCMilliseconds() !== 0) {
            throw Error("Start timestamp is not a beggining of a month");
        }

        const cliffEnd = new Date(begin);
        cliffEnd.setMonth(begin.getMonth() + vestingCliff);

        const end = new Date(begin);
        end.setMonth(begin.getMonth() + totalVestingDuration);

        const current = new Date(currentTimestamp * 1000);

        if (current < cliffEnd) {
            return 0;
        } else if (current >= end) {
            return tokensAmount;
        } else {
            let totalIntervalsNumber;
            let passedIntervalsNumber;
            if (vestingIntervalTimeUnit === TimeUnit.DAY) {
                totalIntervalsNumber = Math.floor(differenceInDays(cliffEnd, end) / vestingInterval);
                passedIntervalsNumber = Math.floor(differenceInDays(cliffEnd, current <= end ? current : end) / vestingInterval);
            } else if (vestingIntervalTimeUnit === TimeUnit.MONTH) {
                totalIntervalsNumber = Math.floor(differenceInMonths(cliffEnd, end) / vestingInterval);
                passedIntervalsNumber = Math.floor(differenceInMonths(cliffEnd, current <= end ? current : end) / vestingInterval);
            } else if (vestingIntervalTimeUnit === TimeUnit.YEAR) {
                totalIntervalsNumber = Math.floor(differenceInYears(cliffEnd, end) / vestingInterval);
                passedIntervalsNumber = Math.floor(differenceInYears(cliffEnd, current <= end ? current : end) / vestingInterval);
            } else {
                throw new Error("Unknown time unit");
            }
            if (totalIntervalsNumber > 0) {
                return tokensAmountAfterCliff + Math.floor((tokensAmount - tokensAmountAfterCliff) * passedIntervalsNumber / totalIntervalsNumber);
            } else {
                return tokensAmountAfterCliff;
            }
        }
    }

export function calculateLockedAmount(time: number, startDate: number, lockupPeriod: number, fullPeriod: number, fullAmount: number, lockupAmount: number, vestPeriod: number, vestTime: number) {
    return fullAmount - calculateVestedAmount(time, startDate, lockupPeriod, fullPeriod, vestPeriod, vestTime, fullAmount, lockupAmount);
}

