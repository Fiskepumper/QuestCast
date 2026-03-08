const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  console.log("📍 Deployer address:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 POL balance:", hre.ethers.formatEther(balance), "POL");
  
  const polPrice = 0.4; // Approximate
  const usdValue = parseFloat(hre.ethers.formatEther(balance)) * polPrice;
  console.log("💵 USD value: ~$", usdValue.toFixed(2));
  
  if (parseFloat(hre.ethers.formatEther(balance)) < 0.1) {
    console.log("\n⚠️  WARNING: Low balance! Deploy may fail.");
    console.log("   Recommend at least 0.5 POL for safe deployment.");
  } else {
    console.log("\n✅ Balance looks good!");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
