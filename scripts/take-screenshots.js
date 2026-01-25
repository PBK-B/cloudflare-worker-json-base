const { chromium } = require('playwright');
const path = require('path');

const VIEWPORT = { width: 1400, height: 900 };

async function takeAllScreenshots() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    viewport: VIEWPORT
  });
  
  const page = await context.newPage();
  const imagesDir = path.join(__dirname, '..', 'docs', 'images');
  
  console.log('📸 Taking all screenshots...');
  console.log(`   Resolution: ${VIEWPORT.width}x${VIEWPORT.height}`);
  
  // Screenshot 1: Login page (before login)
  console.log('\n  • Login page...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(imagesDir, 'console-login.png'), fullPage: false });
  
  // Login for other screenshots
  console.log('  • Logging in...');
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.fill('MYDATABASEKEY');
  await page.click('.rs-btn.rs-btn-primary');
  await page.waitForTimeout(3000);
  
  // Screenshot 2: Dashboard
  console.log('  • Dashboard...');
  await page.screenshot({ path: path.join(imagesDir, 'console-dashboard.png'), fullPage: false });
  
  // Screenshot 3: Data management page
  console.log('  • Data management...');
  await page.goto('http://localhost:3000/admin/data', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(imagesDir, 'console-data.png'), fullPage: false });
  
  await browser.close();
  
  console.log('\n✅ All screenshots saved to docs/images/');
  console.log(`   Resolution: ${VIEWPORT.width}x${VIEWPORT.height}`);
  console.log('   - console-login.png');
  console.log('   - console-dashboard.png');
  console.log('   - console-data.png');
}

takeAllScreenshots().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
