# local-blockchain-setup
 We'll use Hardhat, a standard and powerful Ethereum development environment with a local blockchain network that is perfect for this task. We'll write the contract in Solidity and use Ethers.js (included with Hardhat) to interact with it concurrently from a script.

To install and setup the Local Blockchain fiew the pdf

To Run:

Terminal 1:
npx hardhat node

Simultaneously in terminal 2: 
For Counter contract:
npx hardhat run scripts/runWorkerBenchmark.js --network localhost

For Transfer contract:
npx hardhat run scripts/runAccountBalanceBenchmark.js --network localhost
