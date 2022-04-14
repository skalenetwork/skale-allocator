// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity 0.6.10;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";


contract InitializableWithGap is Initializable {
    uint256[50] private ______gap;
}
