// runWorkerBenchmark.js
const hre = require("hardhat");
const { ethers } = hre;
const Piscina = require('piscina');
const path = require('path');
const { performance } = require('perf_hooks');
const os = require('os');

// --- Import constants ---
const { HARDHAT_PRIVATE_KEYS } = require('./constants.js');

// --- Configuration ---
const CONTRACT_NAME = "Counter";
const TOTAL_TRANSACTIONS = 1000;
const WORKER_COUNTS = [256];
// --- End Configuration ---

async function main() {
    console.log("Starting World Saving Multi-Core Worker Benchmark...");
    console.log(`Contract: ${CONTRACT_NAME}`);
    console.log(`Total Transactions per run: ${TOTAL_TRANSACTIONS}`);
    console.log(`Worker Counts (Threads) to test: ${WORKER_COUNTS.join(', ')}`);

    await hre.run('compile');

    const availableSignersCount = HARDHAT_PRIVATE_KEYS.length;
    if (availableSignersCount === 0) {
        console.error("❌ Critical Error: No private keys found in constants.js.");
        process.exit(1);
    }
    console.log(`Using ${availableSignersCount} signers defined in constants.js.`);

    const validWorkerCounts = WORKER_COUNTS;
    const numCPUs = os.cpus().length;
    validWorkerCounts.forEach(count => {
        if (count > numCPUs) {
            console.warn(`⚠️ Warning: Testing with ${count} workers, which is more than the system's ${numCPUs} logical CPU cores. Performance might plateau or decrease.`);
        }
    });

    if (validWorkerCounts.length === 0) {
         console.error("❌ Error: No valid worker counts to test.");
         process.exit(1);
    }
    console.log(`Testing with Worker Counts: ${validWorkerCounts.join(', ')}`);

    const privateKeysToUse = HARDHAT_PRIVATE_KEYS;

    // --- MODIFIED RPC URL DETERMINATION ---
    let rpcUrl = hre.network.config.url;
    if (hre.network.name === "hardhat" && !rpcUrl) {
        // If using the default in-memory "hardhat" network,
        // workers need an explicit HTTP endpoint.
        // The `npx hardhat run` command usually makes its node available here.
        rpcUrl = "http://127.0.0.1:8545";
        console.log(`   Network is 'hardhat', explicitly setting RPC URL for workers to: ${rpcUrl}`);
    }

    if (!rpcUrl) {
        console.error(`❌ Critical Error: RPC URL could not be determined for network '${hre.network.name}'.`);
        console.error("   Ensure your hardhat.config.js defines a URL for this network, or check network name.");
        process.exit(1);
    }
    // --- END MODIFIED RPC URL DETERMINATION ---


    const benchmarkResults = {};

    for (const workerCount of validWorkerCounts) {
        console.log(`\n--- Testing with ${workerCount} Worker Threads ---`);

        // 1. Deploy Contract
        console.log("   Deploying new Counter contract...");
        const CounterFactory = await ethers.getContractFactory(CONTRACT_NAME);
        const counterContract = await CounterFactory.deploy();
        await counterContract.waitForDeployment();
        const contractAddress = await counterContract.getAddress();
        console.log(`   Counter deployed to: ${contractAddress}`);
        const initialCount = await counterContract.count();
        console.log(`   Initial count: ${initialCount.toString()}`);

        // 2. Setup Piscina Worker Pool
        const piscina = new Piscina({
            filename: path.resolve(__dirname, 'workerBenchmark.js'),
            maxThreads: workerCount
        });

        // 3. Prepare and Distribute Tasks
        const taskPromises = [];
        console.log(`   Assigning ${TOTAL_TRANSACTIONS} transactions (alternating ${availableSignersCount} signers) across ${workerCount} workers...`);
        for (let i = 0; i < TOTAL_TRANSACTIONS; i++) {
            const signerIndex = i % availableSignersCount;
            const assignedPrivateKey = privateKeysToUse[signerIndex];
            const workerIndex = i % workerCount;

            const workerData = {
                contractAddress,
                rpcUrl, // Pass the now correctly determined rpcUrl
                privateKey: assignedPrivateKey,
                contractName: CONTRACT_NAME,
                workerId: workerIndex,
                txIndex: i
            };
            taskPromises.push(piscina.run(workerData));
        }
        console.log(`   All ${TOTAL_TRANSACTIONS} tasks submitted to the worker pool.`);

        // 4. Run tasks and measure time
        const startTime = performance.now();
        const results = await Promise.all(taskPromises);
        const endTime = performance.now();
        const durationMs = endTime - startTime;
        const durationSec = (durationMs / 1000).toFixed(2);

        await piscina.destroy();

        console.log(`\n   All ${results.length} worker tasks completed.`);
        console.log(`   Time taken: ${durationSec} seconds (${durationMs.toFixed(0)} ms)`);

        // 5. Process results and Verify
        let totalSuccessfulIncrements = 0;
        let totalFailedIncrements = 0;
        results.forEach(res => {
            if (res && typeof res.success === 'boolean') {
                if (res.success) {
                    totalSuccessfulIncrements++;
                } else {
                    totalFailedIncrements++;
                }
            } else {
                 console.error(`   Received unexpected result from a worker task (TxIndex: ${res?.txIndex}):`, res);
                 totalFailedIncrements++;
            }
        });

        console.log(`   Reported Successes: ${totalSuccessfulIncrements}`);
        console.log(`   Reported Failures: ${totalFailedIncrements}`);

        const finalCount = await counterContract.count();
        console.log(`   Final count read from contract: ${finalCount.toString()}`);
        const expectedCount = initialCount + BigInt(totalSuccessfulIncrements);

        if (finalCount === expectedCount) {
            console.log(`   ✅ Verification Success! Final count (${finalCount}) matches expected count based on successful worker reports (${expectedCount}).`);
        } else {
            console.error(`   ❌ Verification Failed! Final count (${finalCount}) does NOT match expected (${expectedCount}).`);
            console.error(`   (${totalFailedIncrements} tasks reported failure or were unexpected)`);
        }

        // 6. Store results
        benchmarkResults[workerCount] = {
            durationMs: durationMs,
            durationSec: parseFloat(durationSec),
            finalCount: finalCount.toString(),
            reportedSuccess: totalSuccessfulIncrements,
            reportedFailures: totalFailedIncrements,
        };

    } // End loop through worker counts

    // --- Final Report ---
    console.log("\n--- Multi-Core Worker Benchmark Summary ---");
    console.log(`Total Transactions attempted per run: ${TOTAL_TRANSACTIONS}`);
    console.log(`Signers used per run (from constants.js): ${availableSignersCount}`);
    console.table(benchmarkResults);
    console.log("\nMulti-core benchmark complete. The world's status is stable.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n🔥🔥🔥 A critical error occurred during the multi-core benchmark! 🔥🔥🔥");
        console.error(error);
        process.exit(1);
    });