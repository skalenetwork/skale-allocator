
function calculatePartPayment(startDate: number, lockupPeriod: number, fullPeriod: number, fullAmount: number, lockupAmount: number, vestPeriod: number, vestTime: number) {
    const initDate = new Date(startDate * 1000);
    let tempDate = new Date(initDate.getTime());
    let temp = initDate.getUTCMonth() + lockupPeriod;
    const lockupDate = new Date(tempDate.setUTCFullYear(initDate.getUTCFullYear() + Math.floor(temp / 12), temp % 12));

    tempDate = new Date(initDate.getTime());
    temp = initDate.getUTCMonth() + fullPeriod;
    const finishDate = new Date(tempDate.setUTCFullYear(initDate.getUTCFullYear() + Math.floor(temp / 12), temp % 12));

    const lockupTime = Math.floor(lockupDate.getTime() / 1000);
    const finishTime = Math.floor(finishDate.getTime() / 1000);

    let numberOfPartPayments = 1;
    if (vestPeriod === 1) {
        const lockupDay = Math.floor(lockupTime / 86400);
        const finishDay = Math.floor(finishTime / 86400);
        numberOfPartPayments = Math.floor((finishDay - lockupDay) / vestTime);
    } else if (vestPeriod === 2) {
        numberOfPartPayments = Math.floor((fullPeriod - lockupPeriod) / vestTime);
    } else {
        numberOfPartPayments = Math.floor((fullPeriod - lockupPeriod) / 12 * vestTime);
    }
    // console.log("Full period:", fullPeriod);
    // console.log("Lockup period:", lockupPeriod);
    // console.log("Vesttime:", vestTime);
    // console.log("Number of payments:", numberOfPartPayments);
    return Math.floor((fullAmount - lockupAmount) / numberOfPartPayments);
}

function addTimePointToTimestamp(date: Date, vestPeriod: number, vestTime: number) {
    if (vestPeriod === 1) {
        const newDate = new Date(date);
        newDate.setUTCDate(date.getUTCDate() + vestTime);
        return newDate;
    } else if (vestPeriod === 2) {
        const newDate = new Date(date);
        newDate.setUTCMonth(date.getUTCMonth() + vestTime);
        return newDate;
    } else {
        const newDate = new Date(date);
        newDate.setUTCFullYear(date.getUTCFullYear() + vestTime);
        return newDate;
    }
}

export function calculateLockedAmount(time: number, startDate: number, lockupPeriod: number, fullPeriod: number, fullAmount: number, lockupAmount: number, vestPeriod: number, vestTime: number) {
    const initDate = new Date(startDate * 1000);

    let tempDate = new Date(initDate.getTime());
    let temp = initDate.getUTCMonth() + lockupPeriod;
    const lockupDate = new Date(tempDate.setUTCFullYear(initDate.getUTCFullYear() + Math.floor(temp / 12), temp % 12));

    tempDate = new Date(initDate.getTime());
    temp = initDate.getUTCMonth() + fullPeriod;
    const finishDate = new Date(tempDate.setUTCFullYear(initDate.getUTCFullYear() + Math.floor(temp / 12), temp % 12));

    const currentTime = new Date(time * 1000);

    // console.log("Current time:", currentTime.toUTCString());
    // console.log("Start time:  ", initDate.toUTCString());
    // console.log("Lockup time: ", lockupDate.toUTCString());
    // console.log("Finish time: ", finishDate.toUTCString());

    if (Math.floor(currentTime.getTime() / 1000) >= Math.floor(finishDate.getTime() / 1000)) {
        return 0;
    }

    if (Math.floor(currentTime.getTime() / 1000) < Math.floor(lockupDate.getTime() / 1000)) {
        return fullAmount;
    }

    let lockedAmount = fullAmount - lockupAmount;
    const partPayment = calculatePartPayment(startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);
    // console.log("Part payment:", partPayment);

    let indexTime = addTimePointToTimestamp(lockupDate, vestPeriod, vestTime);
    // console.log("Index Time:", indexTime.toUTCString());

    while (Math.floor(indexTime.getTime() / 1000) <= Math.floor(currentTime.getTime() / 1000)) {
        // console.log("Index Time:", indexTime.toUTCString());
        lockedAmount -= partPayment;
        indexTime = addTimePointToTimestamp(indexTime, vestPeriod, vestTime);
        // console.log("New Index Time:", indexTime.toUTCString());

    }
    return lockedAmount;
}

