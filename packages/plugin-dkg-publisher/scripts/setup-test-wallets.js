/**
 * Setup test wallets for parallel publishing
 * Reads private keys from DKG_PUBLISH_WALLETS env variable
 * Run this before running tests to populate the database
 */

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
const { Wallet } = require('ethers');

// Load environment variables from .env.publisher
const envPath = path.join(__dirname, '..', '.env.publisher');
console.log(`Loading environment from: ${envPath}`);
dotenv.config({ path: envPath });

async function setupTestWallets() {
  console.log('Setting up test wallets in database...');

  // Get database URL and private keys from environment
  const dbUrl = process.env.DKGP_DATABASE_URL || 'mysql://root:@127.0.0.1:3306/dkg_publisher_db';
  const privateKeysString = process.env.DKG_PUBLISH_WALLETS;
  const blockchain = process.env.DKG_BLOCKCHAIN || 'otp:20430';

  if (!privateKeysString) {
    console.error('ERROR: DKG_PUBLISH_WALLETS environment variable not set');
    console.error('Please set it in .env.publisher file');
    console.error('Example: DKG_PUBLISH_WALLETS=0xkey1,0xkey2,0xkey3,...');
    process.exit(1);
  }

  // Parse comma-separated private keys
  const privateKeys = privateKeysString.split(',').map(key => key.trim());
  
  if (privateKeys.length === 0) {
    console.error('ERROR: DKG_PUBLISH_WALLETS is empty');
    process.exit(1);
  }

  console.log(`Found ${privateKeys.length} private keys in environment`);

  // Parse database URL
  const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]*)@([^:]+):(\d+)\/(.+)/);
  if (!match) {
    console.error('ERROR: Invalid database URL format');
    console.error('Expected: mysql://user:password@host:port/database');
    process.exit(1);
  }

  const [, user, password, host, port, database] = match;

  // Connect to database
  console.log(`Connecting to MySQL: ${host}:${port}/${database}`);
  const connection = await mysql.createConnection({
    host,
    port: parseInt(port),
    user,
    password: password || undefined,
    database,
  });

  console.log('Connected to database');

  // Insert or update each wallet
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < privateKeys.length; i++) {
    const privateKey = privateKeys[i];
    
    try {
      // Ensure private key has 0x prefix
      const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
      
      // Derive address from private key
      const wallet = new Wallet(normalizedKey);
      const address = wallet.address;

      // Insert or update wallet in database
      await connection.execute(
        `INSERT INTO wallets (address, private_key_encrypted, blockchain, is_active, is_locked) 
         VALUES (?, ?, ?, 1, 0)
         ON DUPLICATE KEY UPDATE is_active = 1, is_locked = 0`,
        [address, normalizedKey, blockchain]
      );

      console.log(`  [${i + 1}/${privateKeys.length}] Added wallet: ${address}`);
      successCount++;
    } catch (error) {
      console.error(`  [${i + 1}/${privateKeys.length}] ERROR: Failed to add wallet`);
      console.error(`    Private key: ${privateKey.substring(0, 10)}...`);
      console.error(`    Error: ${error.message}`);
      errorCount++;
    }
  }

  await connection.end();

  console.log('');
  console.log('Setup complete:');
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Total: ${privateKeys.length}`);

  if (errorCount > 0) {
    console.log('');
    console.log('WARNING: Some wallets failed to be added');
    process.exit(1);
  }

  console.log('');
  console.log('All wallets configured successfully!');
}

// Run the setup
setupTestWallets().catch((error) => {
  console.error('FATAL ERROR:', error);
  process.exit(1);
});
