
function calculatePartPayment(startDate: number, lockupPeriod: number, fullPeriod: number, fullAmount: number, lockupAmount: number, vestPeriod: number, vestTime: number) {
    const initDate = new Date(startDate * 1000);
    let tempDate = new Date(initDate.getTime());
    let temp = initDate.getMonth() + lockupPeriod;
    const lockupDate = new Date(tempDate.setFullYear(initDate.getFullYear() + Math.floor(temp / 12), temp % 12));

    tempDate = new Date(initDate.getTime());
    temp = initDate.getMonth() + fullPeriod;
    const finishDate = new Date(tempDate.setFullYear(initDate.getFullYear() + Math.floor(temp / 12), temp % 12));

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
    return Math.floor((fullAmount - lockupAmount) / numberOfPartPayments);
}

function addTimePointToTimestamp(date: Date, vestPeriod: number, vestTime: number) {
    if (vestPeriod === 1) {
        const newDate = new Date(date);
        newDate.setDate(date.getDate() + vestTime);
        return newDate;
    } else if (vestPeriod === 2) {
        const newDate = new Date(date);
        newDate.setMonth(date.getMonth() + vestTime);
        return newDate;
    } else {
        const newDate = new Date(date);
        newDate.setFullYear(date.getFullYear() + vestTime);
        return newDate;
    }
}

export function calculateLockedAmount(time: number, startDate: number, lockupPeriod: number, fullPeriod: number, fullAmount: number, lockupAmount: number, vestPeriod: number, vestTime: number) {
    const initDate = new Date(startDate * 1000);

    let tempDate = new Date(initDate.getTime());
    let temp = initDate.getMonth() + lockupPeriod;
    const lockupDate = new Date(tempDate.setFullYear(initDate.getFullYear() + Math.floor(temp / 12), temp % 12));

    tempDate = new Date(initDate.getTime());
    temp = initDate.getMonth() + fullPeriod;
    const finishDate = new Date(tempDate.setFullYear(initDate.getFullYear() + Math.floor(temp / 12), temp % 12));

    const currentTime = new Date(time * 1000);

    if (Math.floor(currentTime.getTime() / 1000) >= Math.floor(finishDate.getTime() / 1000)) {
        return 0;
    }

    if (Math.floor(currentTime.getTime() / 1000) < Math.floor(lockupDate.getTime() / 1000)) {
        return fullAmount;
    }

    let lockedAmount = fullAmount - lockupAmount;
    const partPayment = calculatePartPayment(startDate, lockupPeriod, fullPeriod, fullAmount, lockupAmount, vestPeriod, vestTime);

    let indexTime = addTimePointToTimestamp(lockupDate, vestPeriod, vestTime);

    while (Math.floor(indexTime.getTime() / 1000) < Math.floor(currentTime.getTime() / 1000)) {
        lockedAmount -= partPayment;
        indexTime = addTimePointToTimestamp(indexTime, vestPeriod, vestTime);
    }
    return lockedAmount;
}

