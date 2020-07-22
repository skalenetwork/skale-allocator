require('dotenv').config();

module.exports = {    
    compileCommand: 'npx buidler compile',
    testCommand: 'npx buidler test',
    norpc: true,
    skipFiles: ['thirdparty/', 'test/'],
    copyPackages: ['@openzeppelin/contracts'],
    providerOptions: {
        "gas": 100000000,
        "gasPrice": "0x01"
    }
};
