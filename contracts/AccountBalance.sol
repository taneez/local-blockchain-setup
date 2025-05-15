// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9; // Or your preferred compatible version

import "hardhat/console.sol"; // Optional: For debugging during development

/**
 * @title AccountBalance
 * @dev A simple contract for users to deposit Ether and check their balance.
 * It also includes a basic owner-only withdrawal function.
 */
contract AccountBalance {
    // Mapping from an address to its balance in Ether (wei)
    // 'public' makes this mapping accessible via a generated getter function,
    // but we'll also create an explicit getter for clarity and practice.
    mapping(address => uint256) public balances;

    // Address of the contract owner
    address public owner;

    // Event emitted when Ether is deposited
    event Deposited(address indexed account, uint256 amount);

    // Event emitted when Ether is withdrawn by the owner
    event WithdrawnByOwner(address indexed owner, uint256 amount);

    /**
     * @dev Sets the deployer as the owner of the contract.
     */
    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Modifier to restrict function access to the contract owner.
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    /**
     * @dev Allows a user to deposit Ether into their account within this contract.
     * The `payable` keyword allows this function to receive Ether.
     * The amount of Ether sent with the transaction (msg.value) is automatically
     * credited to the contract and can then be managed.
     */
    function deposit() public payable {
        require(msg.value > 0, "Deposit amount must be greater than 0");

        // Add the deposited amount (msg.value) to the sender's balance
        balances[msg.sender] += msg.value;

        // Emit an event to log the deposit
        emit Deposited(msg.sender, msg.value);

        // Optional: Log to Hardhat console during development
        // console.log("User %s deposited %s wei. New balance: %s wei", msg.sender, msg.value, balances[msg.sender]);
    }

    /**
     * @dev Returns the Ether balance of a specific account within this contract.
     * @param _account The address of the account to query.
     * @return The balance in wei.
     */
    function getBalance(address _account) public view returns (uint256) {
        return balances[_account];
    }

    /**
     * @dev Returns the Ether balance of the caller (msg.sender) within this contract.
     * This is a convenience function.
     * @return The balance of the caller in wei.
     */
    function getMyBalance() public view returns (uint256) {
        return balances[msg.sender];
    }

    /**
     * @dev Allows the contract owner to withdraw all Ether from the contract.
     * This function sends the entire contract balance to the owner's address.
     */
    function withdrawAll() public onlyOwner {
        uint256 contractBalance = address(this).balance;
        require(contractBalance > 0, "Contract has no balance to withdraw");

        // Send the entire contract balance to the owner
        // Using .call is recommended for sending Ether.
        (bool success, ) = owner.call{value: contractBalance}("");
        require(success, "Withdrawal failed");

        emit WithdrawnByOwner(owner, contractBalance);
    }

    /**
     * @dev Returns the total Ether balance held by this smart contract itself.
     * @return The total Ether balance of the contract in wei.
     */
    function getContractBalance() public view returns (uint256) {
        return address(this).balance;
    }

    // Fallback function to receive Ether directly (e.g., if someone just sends Ether to the contract address)
    // If Ether is sent directly to the contract, it will be treated as a deposit from the sender.
    receive() external payable {
        if (msg.value > 0) {
            balances[msg.sender] += msg.value;
            emit Deposited(msg.sender, msg.value);
        }
    }
}