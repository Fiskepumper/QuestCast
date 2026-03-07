const hre = require('hardhat');

async function main() {
  const USDC_ADDRESS = process.env.USDC_CONTRACT_ADDRESS;
  if (!USDC_ADDRESS) throw new Error('USDC_CONTRACT_ADDRESS mangler i .env');

  console.log('Deployer:', (await hre.ethers.getSigners())[0].address);
  console.log('USDC:    ', USDC_ADDRESS);
  console.log('Nettverk:', hre.network.name);

  const Factory  = await hre.ethers.getContractFactory('QuestCastChallenge');
  const contract = await Factory.deploy(USDC_ADDRESS);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('\n✅ QuestCastChallenge deployet til:', address);
  console.log('\nLegg dette i .env:');
  console.log(`QUESTCAST_CONTRACT_ADDRESS=${address}`);

  // Verifiser på Polygonscan automatisk
  if (hre.network.name === 'polygon') {
    console.log('\nVerifiserer på Polygonscan...');
    try {
      await hre.run('verify:verify', {
        address,
        constructorArguments: [USDC_ADDRESS],
      });
      console.log('✅ Verifisert!');
    } catch (e) {
      console.log('Verifikasjon feilet (kan gjøres manuelt):', e.message);
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
