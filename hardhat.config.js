require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || '';

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    polygon: {
      url: process.env.POLYGON_RPC_URL || `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY.replace(/^0x/, '')}`] : [],
      chainId: 137,
    },
    // For testing — ingen ekte penger
    hardhat: {
      chainId: 31337,
    },
  },
  etherscan: {
    apiKey: {
      polygon: process.env.POLYGONSCAN_API_KEY || '',
    },
  },
};
