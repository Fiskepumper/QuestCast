const hre = require("hardhat");

/**
 * Deploy ChallengeHub contract til Polygon Mainnet
 * 
 * Kommando:
 * npx hardhat run scripts/deployChallengeHub.js --network polygon
 * 
 * VIKTIG: Sett USDC_CONTRACT_ADDRESS og fee recipient i .env
 */

async function main() {
  console.log("🚀 Deployer ChallengeHub til Polygon...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("📍 Deployer address:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 Deployer balance:", hre.ethers.formatEther(balance), "POL\n");

  // USDC på Polygon (native Circle USDC)
  const USDC_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
  
  // Fee recipient (kristian sin wallet)
  const FEE_RECIPIENT = process.env.FEE_RECIPIENT || "0x4f875704BA0f35c2F392Fe884E6D5Cdb30e9D3E2";

  console.log("📋 Config:");
  console.log("   USDC Address:", USDC_ADDRESS);
  console.log("   Fee Recipient (2%):", FEE_RECIPIENT);
  console.log("");

  // Deploy
  const ChallengeHub = await hre.ethers.getContractFactory("ChallengeHub");
  const hub = await ChallengeHub.deploy(USDC_ADDRESS, FEE_RECIPIENT);
  
  await hub.waitForDeployment();
  const hubAddress = await hub.getAddress();

  console.log("✅ ChallengeHub deployed to:", hubAddress);
  console.log("");

  // Verify on Polygonscan
  if (process.env.POLYGONSCAN_API_KEY) {
    console.log("⏳ Venter 30 sekunder før verifikasjon...");
    await new Promise(resolve => setTimeout(resolve, 30000));

    console.log("🔍 Verifiserer kontrakt på Polygonscan...");
    try {
      await hre.run("verify:verify", {
        address: hubAddress,
        constructorArguments: [USDC_ADDRESS, FEE_RECIPIENT],
      });
      console.log("✅ Kontrakt verifisert!");
    } catch (error) {
      console.log("⚠️  Verifikasjon feilet:", error.message);
    }
  }

  console.log("\n📝 Husk å oppdatere .env:");
  console.log(`CHALLENGE_HUB_ADDRESS=${hubAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
