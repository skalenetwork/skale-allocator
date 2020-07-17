require('dotenv').config();

module.exports = {    
    compileCommand: 'npx buidler compile',
    testCommand: 'npx buidler test',
    norpc: true,
    skipFiles: ['Migrations.sol', 'thirdparty/', 'interfaces/', 'test/', 'ERC777/'],
    copyPackages: ['@openzeppelin/contracts']
};
