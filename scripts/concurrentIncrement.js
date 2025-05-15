const { ethers } = require("hardhat"); // Import ethers from Hardhat package

async function main() {
    console.log("Starting the world-saving concurrent increment script...");

    // --- 1. Deployment ---
    console.log("\nDeploying Counter contract...");
    const CounterFactory = await ethers.getContractFactory("Counter");
    const counter = await CounterFactory.deploy();
    await counter.waitForDeployment(); // Wait until the contract is deployed and mined
    const contractAddress = await counter.getAddress();
    console.log(`Counter deployed to: ${contractAddress}`);

    // --- 2. Preparation for Concurrency ---
    const initialCount = await counter.count(); // Use the public getter
    console.log(`\nInitial count: ${initialCount.toString()}`);

    // Get multiple signers (accounts) from the Hardhat Network node
    // Hardhat Network provides 20 accounts by default
    const signers = await ethers.getSigners();
    // We'll use the first few accounts to send transactions concurrently
    const numberOfConcurrentTx = 5; // How many transactions to send at once
    const txSigners = signers.slice(0, numberOfConcurrentTx); // Get the first 5 signers

    if (txSigners.length < numberOfConcurrentTx) {
        console.warn(`Warning: Only found ${txSigners.length} signers. Requested ${numberOfConcurrentTx}.`);
    }

    console.log(`\nPreparing to send ${txSigners.length} increment transactions concurrently...`);

    // --- 3. Sending Transactions Concurrently ---
    const transactionPromises = [];
    for (let i = 0; i < txSigners.length; i++) {
        const signer = txSigners[i];
        console.log(`- Preparing tx from signer ${i} (${signer.address.substring(0, 6)}...)`);
        // Connect the contract instance to the specific signer and call increment()
        // Each call returns a Promise that resolves with the transaction response
        const txPromise = counter.connect(signer).increment();
        transactionPromises.push(txPromise);
    }

    console.log(`\nSending ${transactionPromises.length} transactions...`);
    // Use Promise.all to send all transactions without waiting for the previous one
    // This sends them to the node near-simultaneously from the script's perspective
    const transactionResponses = await Promise.all(transactionPromises);
    console.log("All transaction requests sent to the node.");

    // --- 4. Waiting for Mining ---
    console.log("\nWaiting for all transactions to be mined...");
    const receiptPromises = transactionResponses.map(txResponse => {
        console.log(`- Waiting for tx: ${txResponse.hash}`);
        // tx.wait() returns a Promise that resolves with the transaction receipt once mined
        return txResponse.wait();
    });

    // Use Promise.all again to wait for all mining confirmations
    const transactionReceipts = await Promise.all(receiptPromises);
    console.log("\nAll transactions have been mined!");
    // You could optionally inspect the receipts here (e.g., check status, gas used)
    // transactionReceipts.forEach(receipt => {
    //     console.log(`- Tx ${receipt.hash} status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
    // });


    // --- 5. Verification ---
    const finalCount = await counter.count(); // Get the final count
    console.log(`\nFinal count: ${finalCount.toString()}`);

    // Verification: The final count should equal the initial count plus the number of successful transactions
    const expectedCount = initialCount + BigInt(transactionReceipts.length);
    if (finalCount === expectedCount) {
        console.log("\n✅ Success! The final count matches the expected count.");
        console.log("The world is saved... for now.");
    } else {
        console.error("\n❌ Critical Failure! The final count is incorrect!");
        console.error(`Expected: ${expectedCount.toString()}, Got: ${finalCount.toString()}`);
        console.error("Initiate contingency plans! The world might be ending!");
    }
}

// Standard pattern to run async main function and handle errors
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n🔥🔥🔥 An error occurred! 🔥🔥🔥");
        console.error(error);
        process.exit(1);
    });