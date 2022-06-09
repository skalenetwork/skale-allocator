import { ethers } from "hardhat";

export async function skipTime(seconds: number) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
}

export async function skipTimeToDate(day: number, monthIndex: number) {
    const timestamp = await currentTime();
    const now = new Date(timestamp * 1000);
    const targetTime = new Date(now);
    if (monthIndex !== undefined) {
        targetTime.setMonth(monthIndex);
    }
    if (day !== undefined) {
        targetTime.setDate(day);
    }
    if (targetTime < now) {
        targetTime.setFullYear(now.getFullYear() + 1);
    }
    const diffInSeconds = Math.round(targetTime.getTime() / 1000) - timestamp;
    await skipTime(diffInSeconds);
}

export async function currentTime() {
    return (await ethers.provider.getBlock("latest")).timestamp;
}

export function getTimeAtDate(day: number, monthIndex: number, year: number) {
    // make a date with a start time(00:00)
    const targetDate = new Date(Date.UTC(year, monthIndex % 12, day, 0, 0, 0));
    return Math.round(targetDate.getTime() / 1000);
}

export const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export async function isLeapYear() {
    const timestamp = await currentTime();
    const now = new Date(timestamp * 1000);
    return now.getFullYear() % 4 === 0;
}
