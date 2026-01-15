/**
 * DKG Publisher Plugin - Parallel Publishing Test (10 Wallets)
 * 
 * Tests 10 simultaneous publishes using 10 different wallets
 * Monitors status via database queries and generates performance statistics
 */

const { test, expect } = require('@playwright/test');
const { ChatbotPage } = require('../pages/chatbotPage');
const { LoginPage } = require('../pages/loginPage');
const mysql = require('mysql2/promise');
const IORedis = require('ioredis');

const TOTAL_ASSETS = 10;
const DB_CHECK_INTERVAL_MS = 3000; // Check database every 3 seconds
// NO TIMEOUT - Test runs until all assets are published or failed

test.describe('DKG Publisher - 10 Parallel Publishes', () => {
  let chatbotPage;
  let loginPage;
  let testResults = null; // Store results to show AFTER servers stop

  test.beforeAll(async () => {
    console.log('\n========================================');
    console.log('NUKING ALL DATA BEFORE TEST');
    console.log('========================================\n');

    // Connect to MySQL
    const connection = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: '',
      database: 'dkg_publisher_db',
    });

    console.log('Clearing MySQL assets and publishing attempts...');
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
    await connection.execute('TRUNCATE TABLE publishing_attempts');
    await connection.execute('TRUNCATE TABLE assets');
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
    console.log('  MySQL cleared');

    await connection.end();

    // Connect to Redis and flush all
    const redis = new IORedis({
      host: 'localhost',
      port: 6379,
    });

    console.log('Flushing Redis...');
    await redis.flushall();
    console.log('  Redis flushed');

    await redis.quit();

    console.log('\nAll data nuked! Starting fresh...\n');
    console.log('========================================\n');
  });

  test.beforeEach(async ({ page }) => {
    chatbotPage = new ChatbotPage(page);
    loginPage = new LoginPage(page);

    await page.goto('/');
    await loginPage.login('admin@gmail.com', 'admin123');
    await chatbotPage.waitForChatReady();
  });

  test('should publish 10 assets in parallel using 10 wallets', async ({ page }) => {
    // Set infinite timeout - we'll wait until all assets are done
    test.setTimeout(0);
    
    console.log('\n========================================');
    console.log('10-WALLET PARALLEL PUBLISH TEST');
    console.log('========================================\n');

    const testStartTime = Date.now();
    const assetResults = [];

    // Step 1: Publish all 10 assets
    console.log('Publishing 10 assets...\n');
    
    for (let i = 1; i <= TOTAL_ASSETS; i++) {
      const contentId = `urn:test:asset:parallel-${Date.now()}-${i}`;
      const assetContent = {
        "@context": {
          "@vocab": "https://schema.org/"
        },
        "@type": "CreativeWork",
        "@id": contentId,
        "name": `Parallel Test Asset ${i}`,
        "description": `Testing parallel publishing with 10 wallets - asset ${i}`,
        "privacy": "private"
      };
      const publishMessage = `Register this Knowledge Asset as PRIVATE using the knowledge-asset-publish tool:\n\n${JSON.stringify(assetContent, null, 2)}\n\nPlease use privacy setting: private`;
      
      console.log(`  ${i}. Sending publish request (Content ID: ${contentId})`);
      await chatbotPage.sendMessage(publishMessage);
      
      // Wait for queued confirmation
      try {
        await page.waitForFunction(
          () => {
            const messages = Array.from(
              document.querySelectorAll('[data-testid="chat-message-text"]'),
            );
            return messages.some((msg) => {
              const text = msg.textContent || "";
              return /queued for publishing/i.test(text) || 
                     /Asset registered for publishing/i.test(text) ||
                     /registered.*publishing/i.test(text);
            });
          },
          {},
          { timeout: 30000 }
        );
        console.log(`     Queued successfully`);
      } catch (err) {
        console.log(`     Warning: Timeout waiting for queue confirmation`);
      }

      assetResults.push({
        number: i,
        contentId,
        startTime: Date.now(),
        status: 'pending',
        assetId: null,
        ual: null,
        error: null,
        duration: null,
      });

      // Click "Start again" to clear chat
      try {
        const startAgainButton = page.getByTestId("start-again-button");
        await startAgainButton.waitFor({ state: 'visible', timeout: 5000 });
        await startAgainButton.click();
        await page.waitForTimeout(500);
      } catch (err) {
        // Button not found, continue
      }
    }

    console.log(`\nAll 10 publish requests sent!\n`);
    
    // Quick check: some might have already completed while queueing
    console.log('Checking for early completions...');
    const earlyConnection = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: '',
      database: 'dkg_publisher_db',
    });

    const [earlyRows] = await earlyConnection.execute(
      'SELECT id, status, ual, last_error FROM assets ORDER BY id'
    );

    let earlyCompletions = 0;
    for (const row of earlyRows) {
      // Match by database ID order (since we nuked before test, ID 1 = asset #1, etc.)
      const asset = assetResults[row.id - 1]; // DB IDs start at 1, array starts at 0
      if (asset && asset.status !== 'published' && asset.status !== 'failed') {
        asset.assetId = row.id;
        
        if (row.status === 'published') {
          asset.status = 'published';
          asset.ual = row.ual;
          asset.duration = Date.now() - asset.startTime;
          console.log(`  Asset #${asset.number} already PUBLISHED!`);
          earlyCompletions++;
        } else if (row.status === 'failed') {
          asset.status = 'failed';
          asset.error = row.last_error || 'Unknown error';
          asset.duration = Date.now() - asset.startTime;
          console.log(`  Asset #${asset.number} already FAILED!`);
          earlyCompletions++;
        } else if (row.status === 'queued') {
          asset.status = 'queued';
          console.log(`  Asset #${asset.number} is QUEUED`);
        } else if (row.status === 'publishing' || row.status === 'assigned') {
          asset.status = 'publishing';
          console.log(`  Asset #${asset.number} is PUBLISHING`);
        }
      }
    }

    await earlyConnection.end();
    
    if (earlyCompletions > 0) {
      console.log(`Found ${earlyCompletions} early completions!\n`);
    } else {
      console.log('No early completions found.\n');
    }
    
    console.log('========================================');
    console.log('MONITORING DATABASE STATUS');
    console.log('========================================\n');

    // Step 2: Monitor database for completion
    const monitorStartTime = Date.now();
    let checkCount = 0;
    
    while (true) {
      checkCount++;
      const elapsed = ((Date.now() - monitorStartTime) / 1000).toFixed(0);
      
      console.log(`\nDB Check #${checkCount} (${elapsed}s elapsed):`);
      console.log('--------------------------------------------');

      // Query database for all assets
      const connection = await mysql.createConnection({
        host: '127.0.0.1',
        port: 3306,
        user: 'root',
        password: '',
        database: 'dkg_publisher_db',
      });

      const [rows] = await connection.execute(
        'SELECT id, status, ual, last_error FROM assets ORDER BY id'
      );

      await connection.end();

      // Update asset results based on database (match by ID order)
      for (const row of rows) {
        const asset = assetResults[row.id - 1]; // DB IDs start at 1, array starts at 0
        if (asset && asset.status !== 'published' && asset.status !== 'failed') {
          // Continue checking assets until they reach a final state
          asset.assetId = row.id;
          const dbStatus = row.status;
          
          if (dbStatus === 'published') {
            asset.status = 'published';
            asset.ual = row.ual;
            asset.duration = Date.now() - asset.startTime;
            console.log(`  Asset #${asset.number} (DB ID: ${row.id}): ✅ PUBLISHED in ${(asset.duration / 1000).toFixed(1)}s`);
          } else if (dbStatus === 'failed') {
            asset.status = 'failed';
            asset.error = row.last_error || 'Unknown error';
            asset.duration = Date.now() - asset.startTime;
            console.log(`  Asset #${asset.number} (DB ID: ${row.id}): ❌ FAILED in ${(asset.duration / 1000).toFixed(1)}s`);
            console.log(`    Error: ${asset.error.substring(0, 100)}`);
          } else if (dbStatus === 'queued') {
            if (asset.status !== 'queued') {
              asset.status = 'queued';
              console.log(`  Asset #${asset.number} (DB ID: ${row.id}): ⏳ QUEUED`);
            }
          } else if (dbStatus === 'publishing' || dbStatus === 'assigned') {
            if (asset.status !== 'publishing') {
              asset.status = 'publishing';
              console.log(`  Asset #${asset.number} (DB ID: ${row.id}): 🔄 PUBLISHING`);
            }
          }
        }
      }

      // Check status
      const pendingCount = assetResults.filter(a => a.status === 'pending').length;
      const queuedCount = assetResults.filter(a => a.status === 'queued').length;
      const publishingCount = assetResults.filter(a => a.status === 'publishing').length;
      const publishedCount = assetResults.filter(a => a.status === 'published').length;
      const failedCount = assetResults.filter(a => a.status === 'failed').length;
      const completedCount = publishedCount + failedCount;
      
      // Only log status every 10 checks to reduce noise (every ~30 seconds)
      if (checkCount % 10 === 0 || completedCount === TOTAL_ASSETS) {
        console.log(`[Check #${checkCount}] ✅ ${publishedCount} published | ❌ ${failedCount} failed | 🔄 ${publishingCount} publishing | ⏳ ${queuedCount} queued | ⚪ ${pendingCount} pending`);
      }

      // Exit ONLY when all 10 are published or failed (NOT while queued/publishing)
      if (completedCount >= TOTAL_ASSETS) {
        console.log('\n✅✅✅ ALL 10 ASSETS COMPLETED! ✅✅✅');
        console.log(`   Published: ${publishedCount}, Failed: ${failedCount}`);
        console.log('   Exiting monitoring loop...\n');
        break;
      }

      // Log progress every 5 minutes for long-running tests
      if (checkCount % 100 === 0) {
        const elapsedMinutes = ((Date.now() - monitorStartTime) / 60000).toFixed(1);
        console.log(`\n⏰ ${elapsedMinutes} minutes elapsed - Still waiting for ${TOTAL_ASSETS - completedCount} assets to complete...`);
        
        // Detect potential stuck assets (queued for >30 min)
        const longQueued = assetResults.filter(a => 
          (a.status === 'queued' || a.status === 'pending') && 
          (Date.now() - a.startTime) > 30 * 60 * 1000
        );
        if (longQueued.length > 0) {
          console.log(`   ⚠️  WARNING: ${longQueued.length} asset(s) queued for >30 minutes - may indicate wallet shortage or plugin issue`);
        }
      }

      // Wait before next check
      await page.waitForTimeout(DB_CHECK_INTERVAL_MS);
    }

    console.log('🏁 Monitoring complete. Test will now exit and servers will shut down...\n');
    console.log('   📊 Final results will appear after cleanup.\n');

    // Store results for afterAll reporting (after servers stop)
    testResults = {
      totalDuration: Date.now() - testStartTime,
      assetResults: assetResults,
      totalAssets: TOTAL_ASSETS,
    };
  });

  test.afterAll(async () => {
    // Wait for servers to finish shutting down
    console.log('\n🧹 Cleanup complete. Servers stopped. Displaying results...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (!testResults) {
      console.log('\n⚠️  No test results available');
      return;
    }

    const { totalDuration, assetResults, totalAssets } = testResults;

    console.log('\n\n');
    console.log('================================================================================');
    console.log('================================================================================');
    console.log('================================================================================');
    console.log('                                                                                ');
    console.log('          📊  PARALLEL PERFORMANCE TEST RESULTS - FINAL REPORT  📊             ');
    console.log('                                                                                ');
    console.log('================================================================================');
    console.log('================================================================================');
    console.log('================================================================================');

    const successfulPublishes = assetResults.filter(r => r.status === 'published');
    const failedPublishes = assetResults.filter(r => r.status === 'failed');

    console.log('\n📊 Summary:');
    console.log(`   Total Assets: ${totalAssets}`);
    console.log(`   ✅ Published: ${successfulPublishes.length} (${((successfulPublishes.length / totalAssets) * 100).toFixed(2)}%)`);
    console.log(`   ❌ Failed: ${failedPublishes.length} (${((failedPublishes.length / totalAssets) * 100).toFixed(2)}%)`);
    
    if (successfulPublishes.length + failedPublishes.length !== totalAssets) {
      console.log(`   ⚠️  WARNING: Only ${successfulPublishes.length + failedPublishes.length} assets completed out of ${totalAssets}!`);
    }

    const successfulDurations = successfulPublishes.map(r => r.duration);
    const avgSuccessTime = successfulDurations.length > 0 ? successfulDurations.reduce((a, b) => a + b, 0) / successfulDurations.length : 0;
    const fastestSuccess = successfulDurations.length > 0 ? Math.min(...successfulDurations) : 0;
    const slowestSuccess = successfulDurations.length > 0 ? Math.max(...successfulDurations) : 0;

    console.log('\n⏱️  Timing (successful publishes only):');
    console.log(`   Average: ${avgSuccessTime.toFixed(0)}ms (${(avgSuccessTime / 1000).toFixed(1)}s)`);
    console.log(`   Fastest: ${fastestSuccess.toFixed(0)}ms (${(fastestSuccess / 1000).toFixed(1)}s)`);
    console.log(`   Slowest: ${slowestSuccess.toFixed(0)}ms (${(slowestSuccess / 1000).toFixed(1)}s)`);
    console.log(`   Total Test Duration: ${(totalDuration / 1000).toFixed(1)}s`);

    console.log('\n📋 Detailed Results:');
    console.log('--------------------------------------------------------------------------------');
    console.log('Asset | ID    | Status           | Duration  | UAL/Error');
    console.log('--------------------------------------------------------------------------------');
    assetResults.forEach((result) => {
      const id = result.assetId || 'N/A';
      const status = result.status;
      const duration = result.duration ? `${(result.duration / 1000).toFixed(1)}s` : 'N/A';
      const detail = result.ual || result.error || '';
      console.log(`${String(result.number).padEnd(5)} | ${String(id).padEnd(5)} | ${status.padEnd(16)} | ${duration.padEnd(9)} | ${detail.substring(0, 50)}...`);
    });
    console.log('--------------------------------------------------------------------------------');

    if (failedPublishes.length > 0) {
      console.log('\n❌ Failure Details:');
      console.log('--------------------------------------------------------------------------------');
      const errorCounts = {};
      failedPublishes.forEach(f => {
        const errorKey = f.error ? f.error.substring(0, 80) : 'Unknown Error';
        errorCounts[errorKey] = (errorCounts[errorKey] || 0) + 1;
      });

      for (const errorKey in errorCounts) {
        const count = errorCounts[errorKey];
        const affectedAssets = failedPublishes
          .filter(f => (f.error ? f.error.substring(0, 80) : 'Unknown Error') === errorKey)
          .map(f => `#${f.number}`)
          .join(", ");
        console.log(`\n${count}x ${errorKey}`);
        console.log(`   Affected assets: ${affectedAssets}`);
      }
      console.log('--------------------------------------------------------------------------------');
    }

    console.log('\n');
    console.log('================================================================================');
    console.log('================================================================================');
    console.log('================================================================================');
    console.log('                                                                                ');
    console.log('                      ✅  TEST RESULTS COMPLETE  ✅                            ');
    console.log('                                                                                ');
    console.log('================================================================================');
    console.log('================================================================================');
    console.log('================================================================================\n\n');
    
    // Assert that at least some assets succeeded
    expect(successfulPublishes.length).toBeGreaterThan(0);
  });
});
