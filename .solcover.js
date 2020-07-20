require('dotenv').config();

module.exports = {    
    compileCommand: 'npx buidler compile',
    testCommand: 'npx buidler test',
    norpc: true,
    skipFiles: ['thirdparty/'],
    copyPackages: ['@openzeppelin/contracts']
};
