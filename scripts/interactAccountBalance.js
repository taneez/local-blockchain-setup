// scripts/interactAccountBalance.js
const { ethers } = require("hardhat");

async function main() {
    // Get signers (accounts from Hardhat Network or your connected node)
    // The first signer is usually the deployer and will become the 'owner' in this contract.
    const [deployer, user1, user2, user3] = await ethers.getSigners();
    const provider = ethers.provider; // Get the provider from ethers (Hardhat injected)

    console.log("Deploying AccountBalance contract with the account:", deployer.address);
    console.log("User1 address:", user1.address);
    console.log("User2 address:", user2.address);
    console.log("User3 address:", user3.address);


    // --- 1. DEPLOYMENT ---
    const AccountBalanceFactory = await ethers.getContractFactory("AccountBalance");
    const accountBalanceContract = await AccountBalanceFactory.deploy();
    await accountBalanceContract.waitForDeployment();
    const contractAddress = await accountBalanceContract.getAddress();
    console.log("\nAccountBalance contract deployed to:", contractAddress);
    console.log("Contract owner (deployer):", await accountBalanceContract.owner());


    // --- 2. DEPOSIT ---
    console.log("\n--- Depositing Funds ---");

    // User1 deposits 1 Ether
    const depositAmountUser1 = ethers.parseEther("1.0"); // Convert 1 Ether to wei
    console.log(`\nUser1 (${user1.address.substring(0,6)}...) depositing ${ethers.formatEther(depositAmountUser1)} ETH...`);
    let tx = await accountBalanceContract.connect(user1).deposit({ value: depositAmountUser1 });
    await tx.wait(); // Wait for the transaction to be mined
    console.log("User1 deposit successful. Tx hash:", tx.hash);

    // User2 deposits 0.5 Ether
    const depositAmountUser2 = ethers.parseEther("0.5");
    console.log(`\nUser2 (${user2.address.substring(0,6)}...) depositing ${ethers.formatEther(depositAmountUser2)} ETH...`);
    tx = await accountBalanceContract.connect(user2).deposit({ value: depositAmountUser2 });
    await tx.wait();
    console.log("User2 deposit successful. Tx hash:", tx.hash);

    // User1 deposits another 0.25 Ether
    const depositAmountUser1_part2 = ethers.parseEther("0.25");
    console.log(`\nUser1 (${user1.address.substring(0,6)}...) depositing another ${ethers.formatEther(depositAmountUser1_part2)} ETH...`);
    tx = await accountBalanceContract.connect(user1).deposit({ value: depositAmountUser1_part2 });
    await tx.wait();
    console.log("User1 second deposit successful. Tx hash:", tx.hash);


    // --- 3. CHECK BALANCES WITHIN CONTRACT ---
    console.log("\n--- Checking Balances Recorded in Contract ---");

    let balanceUser1InContract = await accountBalanceContract.getBalance(user1.address);
    console.log(`User1's balance in contract: ${ethers.formatEther(balanceUser1InContract)} ETH`);

    let balanceUser2InContract = await accountBalanceContract.getBalance(user2.address);
    console.log(`User2's balance in contract: ${ethers.formatEther(balanceUser2InContract)} ETH`);

    // User3 uses getMyBalance
    let balanceUser3InContract = await accountBalanceContract.connect(user3).getMyBalance();
    console.log(`User3's balance in contract (via getMyBalance): ${ethers.formatEther(balanceUser3InContract)} ETH (should be 0)`);

    let balanceDeployerInContract = await accountBalanceContract.getBalance(deployer.address);
    console.log(`Deployer's balance in contract: ${ethers.formatEther(balanceDeployerInContract)} ETH (should be 0 unless they deposited)`);


    // --- 4. CHECK CONTRACT'S TOTAL ETHER BALANCE (ON-CHAIN) ---
    console.log("\n--- Checking Contract's Actual Ether Holdings ---");
    let totalContractEthBalance = await provider.getBalance(contractAddress);
    console.log(`Contract's total Ether balance (on-chain): ${ethers.formatEther(totalContractEthBalance)} ETH`);

    // Also check using the contract's view function
    let totalContractEthBalanceFromFunc = await accountBalanceContract.getContractBalance();
    console.log(`Contract's total Ether balance (from getContractBalance()): ${ethers.formatEther(totalContractEthBalanceFromFunc)} ETH`);


    // --- 5. DEMONSTRATE DIRECT ETHER SEND (using receive() fallback) ---
    console.log("\n--- Demonstrating Direct Ether Send to Contract (via receive()) ---");
    const directSendAmount = ethers.parseEther("0.1");
    console.log(`User3 (${user3.address.substring(0,6)}...) sending ${ethers.formatEther(directSendAmount)} ETH directly to contract...`);
    tx = await user3.sendTransaction({
        to: contractAddress,
        value: directSendAmount
    });
    await tx.wait();
    console.log("User3 direct send successful. Tx hash:", tx.hash);

    balanceUser3InContract = await accountBalanceContract.getBalance(user3.address);
    console.log(`User3's balance in contract after direct send: ${ethers.formatEther(balanceUser3InContract)} ETH`);

    totalContractEthBalance = await provider.getBalance(contractAddress);
    console.log(`Contract's total Ether balance after User3's direct send: ${ethers.formatEther(totalContractEthBalance)} ETH`);


    // --- 6. OWNER WITHDRAW ALL ---
    console.log("\n--- Owner (Deployer) Attempting to Withdraw All Funds ---");
    if (deployer.address === await accountBalanceContract.owner()) {
        const ownerInitialEthBalance = await provider.getBalance(deployer.address);
        // console.log(`Owner's ETH balance before withdrawal: ${ethers.formatEther(ownerInitialEthBalance)} ETH`); // Can be noisy with gas costs

        const contractBalanceBeforeWithdraw = await provider.getBalance(contractAddress);
        console.log(`Contract ETH balance before owner withdrawal: ${ethers.formatEther(contractBalanceBeforeWithdraw)} ETH`);


        console.log("Owner sending withdrawAll() transaction...");
        tx = await accountBalanceContract.connect(deployer).withdrawAll();
        const receiptWithdraw = await tx.wait();
        console.log("Withdrawal transaction successful. Tx hash:", tx.hash);
        // console.log("Gas used for withdrawal:", ethers.formatUnits(receiptWithdraw.gasUsed, "wei"), "wei");

        const ownerFinalEthBalance = await provider.getBalance(deployer.address);
        // console.log(`Owner's ETH balance after withdrawal: ${ethers.formatEther(ownerFinalEthBalance)} ETH`);

        const contractEthBalanceAfterWithdraw = await provider.getBalance(contractAddress);
        console.log(`Contract's total Ether balance after owner withdrawal: ${ethers.formatEther(contractEthBalanceAfterWithdraw)} ETH (should be 0)`);

        // Balances in the 'balances' mapping are not cleared by withdrawAll in this simple design.
        // They represent historical deposits.
        balanceUser1InContract = await accountBalanceContract.getBalance(user1.address);
        console.log(`User1's recorded balance in contract after owner withdrawal: ${ethers.formatEther(balanceUser1InContract)} ETH (unchanged)`);

    } else {
        console.log("Deployer is not the owner, skipping withdrawAll example.");
    }

    console.log("\nInteraction with AccountBalance contract complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("An error occurred:");
        console.error(error);
        process.exit(1);
    });