require('dotenv').config();

module.exports = {    
    compileCommand: 'npx hardhat compile',
    testCommand: 'npx hardhat test',
    norpc: true,
    skipFiles: ['thirdparty/', 'test/'],
    copyPackages: ['@openzeppelin/contracts'],
    providerOptions: {
        "gas": 100000000,
        "gasPrice": "0x01"
    }
};
