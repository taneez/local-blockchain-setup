const { ethers } = require("hardhat");
const { performance } = require('perf_hooks'); // For more precise timing

// --- Configuration ---
const TOTAL_TRANSACTIONS = 1000;
const CONCURRENCY_LEVELS = [1, 2, 4, 8, 16, 32, 64, 128, 256]; // "Threads" simulation
// How many different signers to cycle through for sending transactions.
// Hardhat provides 20 by default. Using more helps distribute nonces slightly.
const MAX_SIGNERS_TO_USE = 20;
// --- End Configuration ---

/**
 * Helper function to run async tasks with a concurrency limit.
 * @param {Array<Function>} tasks - Array of functions, each returning a Promise (our transaction tasks).
 * @param {number} limit - The maximum number of tasks to run concurrently.
 * @returns {Promise<Array>} A Promise that resolves with an array of results from the tasks.
 */
async function runTasksWithConcurrency(tasks, limit) {
    const results = [];
    let activeCount = 0;
    let taskIndex = 0;
    const totalTasks = tasks.length;
    let errors = 0; // Counter for failed tasks

    console.log(`   Running ${totalTasks} tasks with concurrency limit ${limit}...`);

    return new Promise((resolve) => {
        const runNext = () => {
            // Base case: All tasks have been processed (results array is full)
            if (results.length + errors === totalTasks) {
                 console.log(`   Finished running tasks. ${errors} errors encountered.`);
                 resolve(results); // Resolve the main promise
                 return;
            }

            // Launch new tasks while the concurrency limit allows and tasks remain
            while (activeCount < limit && taskIndex < totalTasks) {
                const currentTaskIndex = taskIndex; // Capture index for the promise handler
                const task = tasks[currentTaskIndex];
                taskIndex++;
                activeCount++;

                // Execute the task (which sends and waits for a transaction)
                task()
                    .then(result => {
                        // Store successful result (we only need the fact it succeeded)
                        results.push(true); // Or push result if needed later
                    })
                    .catch(error => {
                        // Task failed
                        errors++;
                        console.error(`   Task ${currentTaskIndex} failed: ${error.message.split('\n')[0]}`); // Log concise error
                        // Optionally store error details if needed: results.push({error: error});
                    })
                    .finally(() => {
                        // When this task completes (success or failure), decrement active count
                        activeCount--;
                        // Log progress intermittently
                        const completed = results.length + errors;
                        if (completed % (Math.floor(totalTasks / 10)) === 0 || completed === totalTasks ) {
                             process.stdout.write(`\r   Progress: ${completed}/${totalTasks} `);
                        }
                        // Try to launch another task
                        runNext();
                    });
            }
        };

        // Start the initial batch of tasks
        runNext();
    });
}


async function main() {
    console.log("Starting World Saving Concurrency Benchmark...");
    console.log(`Total Transactions per run: ${TOTAL_TRANSACTIONS}`);
    console.log(`Concurrency Levels to test: ${CONCURRENCY_LEVELS.join(', ')}`);

    const signers = await ethers.getSigners();
    const signersToUse = signers.slice(0, Math.min(signers.length, MAX_SIGNERS_TO_USE));
    console.log(`Using ${signersToUse.length} signers for transactions.`);

    if (signersToUse.length < 1) {
        console.error("❌ Critical Error: No signers available. Ensure Hardhat Network is running correctly.");
        process.exit(1);
    }

    const benchmarkResults = {};

    for (const concurrency of CONCURRENCY_LEVELS) {
        console.log(`\n--- Testing Concurrency Level: ${concurrency} ---`);

        // 1. Deploy a fresh contract instance for this run
        console.log("   Deploying new Counter contract...");
        const CounterFactory = await ethers.getContractFactory("Counter");
        const counter = await CounterFactory.deploy();
        await counter.waitForDeployment();
        const contractAddress = await counter.getAddress();
        console.log(`   Counter deployed to: ${contractAddress}`);
        const initialCount = await counter.count();
         console.log(`   Initial count: ${initialCount.toString()}`);

        // 2. Prepare transaction tasks
        const transactionTasks = [];
        for (let i = 0; i < TOTAL_TRANSACTIONS; i++) {
            // Cycle through the available signers
            const signer = signersToUse[i % signersToUse.length];
            // Create a function that, when called, sends the transaction AND waits for confirmation
            const task = async () => {
                const txResponse = await counter.connect(signer).increment({
                    // Optional: Set gas limit/price if needed for specific testing,
                    // but usually Hardhat handles this fine automatically.
                    // gasLimit: 300000, // Example
                });
                // IMPORTANT: Wait for the transaction to be mined AND confirmed
                return txResponse.wait(); // Returns the transaction receipt
            };
            transactionTasks.push(task);
        }
        console.log(`   Prepared ${transactionTasks.length} transaction tasks.`);


        // 3. Run tasks with concurrency limit and measure time
        const startTime = performance.now();

        const results = await runTasksWithConcurrency(transactionTasks, concurrency);

        const endTime = performance.now();
        const durationMs = endTime - startTime;
        const durationSec = (durationMs / 1000).toFixed(2);

        console.log(`\n   Time taken: ${durationSec} seconds (${durationMs.toFixed(0)} ms)`);


        // 4. Verify final count
        const finalCount = await counter.count();
        console.log(`   Final count: ${finalCount.toString()}`);

        const successfulTxCount = results.length; // Number of tasks that resolved successfully
        const expectedCount = initialCount + BigInt(successfulTxCount);

        if (finalCount === expectedCount) {
             console.log(`   ✅ Verification Success! Final count matches expected count (${expectedCount}).`);
        } else {
             console.error(`   ❌ Verification Failed! Expected: ${expectedCount}, Got: ${finalCount}`);
             console.error(`   (${TOTAL_TRANSACTIONS - successfulTxCount} transactions may have failed)`);
        }

        // 5. Store results
        benchmarkResults[concurrency] = {
            durationMs: durationMs,
            durationSec: parseFloat(durationSec),
            finalCount: finalCount.toString(),
            successfulTx: successfulTxCount,
            failedTx: TOTAL_TRANSACTIONS - successfulTxCount,
        };
    } // End loop through concurrency levels

    // --- Final Report ---
    console.log("\n--- Benchmark Summary ---");
    console.log(`Total Transactions per run: ${TOTAL_TRANSACTIONS}`);
    console.table(benchmarkResults);
    console.log("\nWorld Saving Benchmark Complete! Review the results carefully.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n🔥🔥🔥 A critical error occurred during the benchmark! 🔥🔥🔥");
        console.error(error);
        process.exit(1);
    });