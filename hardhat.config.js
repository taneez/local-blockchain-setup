// hardhat.config.js
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.20", // Or your version
  networks: {
    hardhat: {
      // No URL needed here if using the implicit in-memory node for single-threaded tasks
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      // accounts are automatically picked up from the 'npx hardhat node' instance
    }
  }
};