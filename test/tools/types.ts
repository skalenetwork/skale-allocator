class Delegation {
    public holder: string;
    public validatorId: bigint;
    public amount: bigint;
    public delegationPeriod: bigint;
    public created: bigint;
    public started: bigint;
    public finished: bigint;
    public info: string;

    constructor(arrayData: [string, bigint, bigint, bigint, bigint, bigint, bigint, string]) {
        this.holder = arrayData[0];
        this.validatorId = arrayData[1];
        this.amount = arrayData[2];
        this.delegationPeriod = arrayData[3];
        this.created = arrayData[4];
        this.started = arrayData[5];
        this.finished = arrayData[6];
        this.info = arrayData[7];
    }
}

enum State {
    PROPOSED,
    ACCEPTED,
    CANCELED,
    REJECTED,
    DELEGATED,
    UNDELEGATION_REQUESTED,
    COMPLETED,
}

export enum BeneficiaryStatus {
    UNKNOWN,
    CONFIRMATION_PENDING,
    CONFIRMED,
    ACTIVE,
    TERMINATED
}

export enum TimeUnit {
    DAY,
    MONTH,
    YEAR
}

export { Delegation, State };
