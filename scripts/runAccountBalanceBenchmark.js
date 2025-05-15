// scripts/runAccountBalanceBenchmark.js
const hre = require("hardhat");
const { ethers } = hre;
const Piscina = require('piscina');
const path = require('path');
const { performance } = require('perf_hooks');
const os = require('os');

// --- Import constants ---
const { HARDHAT_PRIVATE_KEYS } = require('./constants.js');

// --- Configuration ---
const CONTRACT_NAME = "AccountBalance"; // Target contract
const TOTAL_TRANSACTIONS = 1000;     // Number of deposit transactions per run
const DEPOSIT_AMOUNT_ETH = "0.01";   // ETH amount for each deposit transaction
const WORKER_COUNTS = [256]; // Threads to test (adjust based on CPU and signers)
// --- End Configuration ---

async function main() {
    console.log("Starting AccountBalance Multi-Core Worker Benchmark...");
    console.log(`Contract: ${CONTRACT_NAME}`);
    console.log(`Total Deposit Transactions per run: ${TOTAL_TRANSACTIONS}`);
    console.log(`Deposit Amount per transaction: ${DEPOSIT_AMOUNT_ETH} ETH`);
    console.log(`Worker Counts (Threads) to test: ${WORKER_COUNTS.join(', ')}`);

    await hre.run('compile'); // Ensure contracts are compiled

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
            console.warn(`⚠️ Warning: Testing with ${count} workers, which is more than system's ${numCPUs} logical CPU cores.`);
        }
        if (count > availableSignersCount) {
            console.warn(`⚠️ Warning: Testing with ${count} workers, but only ${availableSignersCount} distinct signers. Signers will be heavily reused by each worker.`);
        }
    });

    if (validWorkerCounts.length === 0) {
         console.error("❌ Error: No valid worker counts to test.");
         process.exit(1);
    }
    console.log(`Testing with Worker Counts: ${validWorkerCounts.join(', ')}`);

    const privateKeysToUse = HARDHAT_PRIVATE_KEYS;
    const depositAmountWei = ethers.parseEther(DEPOSIT_AMOUNT_ETH);

    // --- Determine RPC URL ---
    let rpcUrl = hre.network.config.url;
    if (hre.network.name === "hardhat" && !rpcUrl) {
        rpcUrl = "http://127.0.0.1:8545";
        console.log(`   Network is 'hardhat', explicitly setting RPC URL for workers to: ${rpcUrl}`);
    }
    if (!rpcUrl) {
        console.error(`❌ Critical Error: RPC URL could not be determined for network '${hre.network.name}'.`);
        process.exit(1);
    }
    // --- End RPC URL Determination ---

    const benchmarkResults = {};
    const provider = ethers.provider; // For checking final contract balance

    for (const workerCount of validWorkerCounts) {
        console.log(`\n--- Testing with ${workerCount} Worker Threads ---`);

        // 1. Deploy a fresh contract instance
        console.log("   Deploying new AccountBalance contract...");
        const ContractFactory = await ethers.getContractFactory(CONTRACT_NAME);
        const contractInstance = await ContractFactory.deploy();
        await contractInstance.waitForDeployment();
        const contractAddress = await contractInstance.getAddress();
        console.log(`   ${CONTRACT_NAME} deployed to: ${contractAddress}`);
        const initialContractEthBalance = await provider.getBalance(contractAddress);
        console.log(`   Initial contract ETH balance: ${ethers.formatEther(initialContractEthBalance)} ETH`);


        // 2. Setup Piscina Worker Pool
        const piscina = new Piscina({
            filename: path.resolve(__dirname, 'workerAccountBalance.js'),
            maxThreads: workerCount
        });

        // 3. Prepare and Distribute Deposit Tasks
        const taskPromises = [];
        console.log(`   Assigning ${TOTAL_TRANSACTIONS} deposit transactions (alternating ${availableSignersCount} signers) across ${workerCount} workers...`);
        for (let i = 0; i < TOTAL_TRANSACTIONS; i++) {
            const signerIndex = i % availableSignersCount;
            const assignedPrivateKey = privateKeysToUse[signerIndex];
            const workerTaskIndex = i % workerCount; // For distributing to worker threads

            const workerData = {
                contractAddress,
                rpcUrl,
                privateKey: assignedPrivateKey,
                contractName: CONTRACT_NAME,
                workerId: workerTaskIndex, // Used for logging within worker
                txIndex: i,                // Overall transaction index
                depositAmountWei           // Amount to deposit
            };
            taskPromises.push(piscina.run(workerData));
        }
        console.log(`   All ${TOTAL_TRANSACTIONS} deposit tasks submitted to the worker pool.`);

        // 4. Run tasks and measure time
        const startTime = performance.now();
        const results = await Promise.all(taskPromises);
        const endTime = performance.now();
        const durationMs = endTime - startTime;
        const durationSec = (durationMs / 1000).toFixed(2);

        await piscina.destroy(); // Clean up the pool

        console.log(`\n   All ${results.length} worker tasks completed.`);
        console.log(`   Time taken: ${durationSec} seconds (${durationMs.toFixed(0)} ms)`);

        // 5. Process results and Verify
        let totalSuccessfulDeposits = 0;
        let totalFailedDeposits = 0;
        let totalAmountDepositedWei = BigInt(0);

        results.forEach(res => {
            if (res && typeof res.success === 'boolean') {
                if (res.success) {
                    totalSuccessfulDeposits++;
                    totalAmountDepositedWei += BigInt(res.amountDeposited);
                } else {
                    totalFailedDeposits++;
                }
            } else {
                 console.error(`   Received unexpected result from a worker task (TxIndex: ${res?.txIndex}):`, res);
                 totalFailedDeposits++;
            }
        });

        console.log(`   Reported Successful Deposits: ${totalSuccessfulDeposits}`);
        console.log(`   Reported Failed Deposits: ${totalFailedDeposits}`);
        console.log(`   Total Amount Reported Deposited: ${ethers.formatEther(totalAmountDepositedWei)} ETH`);

        // Verify final contract balance on-chain
        const finalContractEthBalance = await provider.getBalance(contractAddress);
        console.log(`   Final contract ETH balance (on-chain): ${ethers.formatEther(finalContractEthBalance)} ETH`);

        const expectedContractEthBalance = initialContractEthBalance + totalAmountDepositedWei;

        if (finalContractEthBalance === expectedContractEthBalance) {
            console.log(`   ✅ Verification Success! Final contract balance matches expected total deposits.`);
        } else {
            console.error(`   ❌ Verification Failed! Final contract balance (${ethers.formatEther(finalContractEthBalance)}) does NOT match expected (${ethers.formatEther(expectedContractEthBalance)}).`);
        }

        // 6. Store results
        benchmarkResults[workerCount] = {
            durationMs: durationMs,
            durationSec: parseFloat(durationSec),
            finalContractBalanceETH: ethers.formatEther(finalContractEthBalance),
            successfulDeposits: totalSuccessfulDeposits,
            failedDeposits: totalFailedDeposits,
            totalDepositedETH: ethers.formatEther(totalAmountDepositedWei),
        };

    } // End loop through worker counts

    // --- Final Report ---
    console.log("\n--- AccountBalance Multi-Core Worker Benchmark Summary ---");
    console.log(`Total Deposit Transactions attempted per run: ${TOTAL_TRANSACTIONS}`);
    console.log(`Deposit Amount per tx: ${DEPOSIT_AMOUNT_ETH} ETH`);
    console.log(`Signers used per run (from constants.js): ${availableSignersCount}`);
    console.table(benchmarkResults);
    console.log("\nAccountBalance benchmark complete. The world's financial stability is being monitored.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n🔥🔥🔥 A critical error occurred during the AccountBalance benchmark! 🔥🔥🔥");
        console.error(error);
        process.exit(1);
    });