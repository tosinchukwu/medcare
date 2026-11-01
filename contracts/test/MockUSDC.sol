// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test-only 6-decimal ERC-20 with an optional blocklist. Any transfer whose
/// recipient is blocked reverts (mimics USDC blocklist behaviour).
contract MockUSDC is ERC20 {
    error BlockedRecipient(address account);

    mapping(address => bool) public blocked;

    constructor() ERC20("Mock USDC", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address account, bool isBlocked) external {
        blocked[account] = isBlocked;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (blocked[to]) revert BlockedRecipient(to);
        super._update(from, to, value);
    }
}
