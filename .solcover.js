require('dotenv').config();

module.exports = {
    compileCommand: 'yarn hardhat compile',
    testCommand: 'yarn hardhat test',
    norpc: true,
    skipFiles: ['thirdparty/', 'test/'],
    copyPackages: ['@openzeppelin/contracts'],
    providerOptions: {
        "gas": 100000000,
        "gasPrice": "0x01"
    }
};
