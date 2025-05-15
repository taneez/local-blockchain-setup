// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9; // Use a version compatible with your Hardhat setup (check hardhat.config.js)

/**
 * @title Counter
 * @dev A simple contract that stores a counter value which can be incremented.
 * The fate of the world depends on its correct functioning!
 */
contract Counter {
    uint256 public count; // Public state variable, automatically creates a getter function 'count()'

    // Event emitted when the counter is incremented
    event Incremented(address sender, uint256 newCount);

    /**
     * @dev Increments the counter state variable by 1.
     * Emits an {Incremented} event.
     */
    function increment() public {
        count += 1;
        emit Incremented(msg.sender, count); // Good practice to emit events for state changes
    }

    /**
     * @dev Returns the current value of the counter.
     * Note: The 'public' keyword for the 'count' variable automatically creates this getter,
     * but defining it explicitly can sometimes be clearer or needed for interfaces.
     * This function is technically redundant due to the public 'count' variable.
     */
    function getCount() public view returns (uint256) {
        return count;
    }
}