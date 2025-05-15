// scripts/workerAccountBalance.js
const { parentPort } = require('worker_threads');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// --- Retry Configuration ---
const MAX_ATTEMPTS = 1000;
const RETRY_DELAY_MS = 2000;
// --- End Retry Configuration ---

// Function to load contract ABI
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
    const {
        contractAddress,
        rpcUrl,
        privateKey,
        contractName, // Should be "AccountBalance"
        workerId,
        txIndex,
        depositAmountWei // Amount to deposit in wei
    } = passedData;

    // 1. Setup Provider and Signer
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    // 2. Get Contract Instance
    const contractAbi = getContractAbi(contractName);
    const accountBalanceContract = new ethers.Contract(contractAddress, contractAbi, signer);

    // 3. Perform the deposit WITH RETRY LOGIC
    let attempt = 0;
    let result = { success: false, error: 'Max attempts reached', workerId: workerId, txIndex: txIndex, amountDeposited: "0" };

    while (attempt < MAX_ATTEMPTS) {
        attempt++;
        try {
            // console.log(`Worker ${workerId} (Tx ${txIndex}) Attempt ${attempt}: Depositing ${ethers.formatEther(depositAmountWei)} ETH...`);
            const tx = await accountBalanceContract.deposit({
                value: depositAmountWei // Send Ether with the transaction
            });
            const receipt = await tx.wait();

            if (receipt.status === 1) {
                result = { success: true, hash: receipt.hash, workerId: workerId, txIndex: txIndex, amountDeposited: depositAmountWei.toString() };
                // console.log(`Worker ${workerId} (Tx ${txIndex}) Attempt ${attempt}: Deposit Success`);
                break; // Exit loop on success
            } else {
                console.error(`Worker ${workerId} (Tx ${txIndex}) Attempt ${attempt}: Deposit Tx reverted (status 0): ${receipt.hash}`);
                result = { success: false, error: `Transaction reverted with status 0`, hash: receipt.hash, workerId: workerId, txIndex: txIndex, amountDeposited: "0" };
                break;
            }
        } catch (error) {
            const errorMessage = error.message ? error.message.toLowerCase() : '';
            const isNonceError = error.code === 'NONCE_EXPIRED' ||
                                 errorMessage.includes('nonce too low') ||
                                 errorMessage.includes('nonce has already been used') ||
                                 errorMessage.includes('replacement transaction underpriced');
            const isNetworkError = errorMessage.includes('failed to detect network') ||
                                 errorMessage.includes('could not detect network') ||
                                 errorMessage.includes('timeout') ||
                                 errorMessage.includes('network error');

            if ((isNonceError || isNetworkError) && attempt < MAX_ATTEMPTS) {
                 const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                 console.warn(`Worker ${workerId} (Tx ${txIndex}) Attempt ${attempt}: Deposit Failed (${error.code || 'N/A'}). Retrying in ${delay}ms...`);
                 console.warn(`   Error: ${error.message.split('\n')[0]}`);
                 result = { success: false, error: error.message, workerId: workerId, txIndex: txIndex, amountDeposited: "0" };
                 await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error(`Worker ${workerId} (Tx ${txIndex}) Attempt ${attempt}: Deposit Failed with non-retryable error or max attempts reached.`);
                console.error(`   Error Code: ${error.code || 'N/A'}`);
                console.error(`   Error: ${error.message.split('\n')[0]}`);
                result = { success: false, error: error.message, workerId: workerId, txIndex: txIndex, amountDeposited: "0" };
                break;
            }
        }
    } // End while loop

    return result;
};