// workerBenchmark.js
const { parentPort } = require('worker_threads');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// --- Retry Configuration ---
const MAX_ATTEMPTS = 100; // Max number of times to attempt a transaction
const RETRY_DELAY_MS = 1000; // Base delay between retries in milliseconds
// --- End Retry Configuration ---

// Function to load contract ABI (keep as is)
function getContractAbi(name) {
    try {
        const artifactsPath = path.resolve(__dirname, '../artifacts/contracts', `${name}.sol`, `${name}.json`);
        if (!fs.existsSync(artifactsPath)) {
            throw new Error(`Artifact file not found at ${artifactsPath}. Make sure contracts are compiled ('npx hardhat compile').`);
        }
        const contractArtifact = JSON.parse(fs.readFileSync(artifactsPath, 'utf8'));
        return contractArtifact.abi;
    } catch (error) {
        console.error(`Error reading ABI for contract ${name}:`, error);
        throw new Error(`Could not load ABI for ${name}.`);
    }
}

// --- This is the function Piscina will run ---
module.exports = async (passedData) => {
    const { contractAddress, rpcUrl, privateKey, contractName, workerId, txIndex } = passedData;

    // 1. Setup Provider and Signer
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    // 2. Get Contract Instance
    const contractAbi = getContractAbi(contractName);
    const counterContract = new ethers.Contract(contractAddress, contractAbi, signer);

    // 3. Perform the increment WITH RETRY LOGIC
    let attempt = 0;
    let result = { success: false, error: 'Max attempts reached', workerId: workerId, txIndex: txIndex }; // Default to failure

    while (attempt < MAX_ATTEMPTS) {
        attempt++;
        try {
            // console.log(`Worker ${workerId} (Tx ${txIndex}) Attempt ${attempt}: Sending tx...`); // Verbose log
            const tx = await counterContract.increment({
                // Optional: Adjust gas settings if needed, but nonce is the main issue here
                // gasLimit: 300000,
            });
            // console.log(`Worker ${workerId} (Tx ${txIndex}) Attempt ${attempt}: Tx sent ${tx.hash}, waiting...`); // Verbose log
            const receipt = await tx.wait();

            if (receipt.status === 1) {
                result = { success: true, hash: receipt.hash, workerId: workerId, txIndex: txIndex };
                // console.log(`Worker ${workerId} (Tx ${txIndex}) Attempt ${attempt}: Success`); // Verbose log
                break; // Exit loop on success
            } else {
                // Transaction reverted on-chain (rare for this contract, but possible)
                console.error(`Worker ${workerId} (Tx ${txIndex}) Attempt ${attempt}: Tx reverted (status 0): ${receipt.hash}`);
                result = { success: false, error: `Transaction reverted with status 0`, hash: receipt.hash, workerId: workerId, txIndex: txIndex };
                // Decide if this specific failure is retryable. Usually, reverts aren't.
                break; // Exit loop on non-retryable failure (revert)
            }
        } catch (error) {
            const errorMessage = error.message ? error.message.toLowerCase() : '';
            // Check for specific retryable errors (Nonce issues are primary)
            // Ethers v6 uses error.code == "NONCE_EXPIRED" more reliably
            // Also check message strings for common node messages
            const isNonceError = error.code === 'NONCE_EXPIRED' ||
                                 errorMessage.includes('nonce too low') ||
                                 errorMessage.includes('nonce has already been used') ||
                                 errorMessage.includes('replacement transaction underpriced'); // May happen if retry logic isn't careful

            const isNetworkError = errorMessage.includes('failed to detect network') ||
                                 errorMessage.includes('could not detect network') ||
                                 errorMessage.includes('timeout') ||
                                 errorMessage.includes('network error'); // Add other potential transient errors

            if ((isNonceError || isNetworkError) && attempt < MAX_ATTEMPTS) {
                 const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
                 console.warn(`Worker ${workerId} (Tx ${txIndex}) Attempt ${attempt}: Failed with ${isNonceError ? 'Nonce' : 'Network'} Error (${error.code || 'N/A'}). Retrying in ${delay}ms...`);
                 console.warn(`   Error: ${error.message.split('\n')[0]}`); // Log concise error message
                 result = { success: false, error: error.message, workerId: workerId, txIndex: txIndex }; // Store latest error
                 await new Promise(resolve => setTimeout(resolve, delay));
                 // Continue to the next iteration of the while loop
            } else {
                // Non-retryable error or max attempts reached
                console.error(`Worker ${workerId} (Tx ${txIndex}) Attempt ${attempt}: Failed with non-retryable error or max attempts reached.`);
                console.error(`   Error Code: ${error.code || 'N/A'}`);
                console.error(`   Error: ${error.message.split('\n')[0]}`);
                result = { success: false, error: error.message, workerId: workerId, txIndex: txIndex };
                break; // Exit loop
            }
        }
    } // End while loop

    return result; // Return the final result after attempts
};