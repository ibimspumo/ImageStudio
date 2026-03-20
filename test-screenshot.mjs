import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

await page.addInitScript(() => {
  window.api = {
    generateImage: async () => ({ success: false, error: 'test' }),
    onGenerateProgress: () => () => {},
    saveImage: async () => ({ success: true }),
    exportImage: async () => ({ success: true }),
    startDrag: () => {},
    compressImage: async (b) => ({ success: true, base64DataUrl: b }),
    getSettings: async () => ({
      apiKey: 'sk-test-key',
      defaultModel: 'google/gemini-3-pro-image-preview',
      defaultAspectRatio: '1:1',
      defaultResolution: '2K',
      defaultImageCount: 1
    }),
    setSetting: async () => ({ success: true }),
    listHistory: async () => ({ success: true, sessions: [] }),
    saveHistory: async () => ({ success: true }),
    deleteHistory: async () => ({ success: true }),
  };
});

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Screenshot 1: Main empty state
await page.screenshot({ path: '/Users/timocorvinus/Desktop/ImageStudio/screenshots/01-empty.png' });

// Screenshot 2: Click into the prompt box and type something
const editor = page.locator('[data-placeholder="Describe your image..."]');
await editor.click();
await editor.type('A beautiful sunset over mountains');
await page.waitForTimeout(500);
await page.screenshot({ path: '/Users/timocorvinus/Desktop/ImageStudio/screenshots/02-typing.png' });

// Screenshot 3: Open settings dialog
const settingsBtn = page.locator('button[title="Settings"]');
if (await settingsBtn.count() > 0) {
  await settingsBtn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/Users/timocorvinus/Desktop/ImageStudio/screenshots/03-settings.png' });
  // Close settings
  const closeBtn = page.locator('text=Cancel');
  if (await closeBtn.count() > 0) await closeBtn.click();
  await page.waitForTimeout(300);
}

// Screenshot 4: Open collections dialog
const collectionsBtn = page.locator('button[title="Collections"]');
if (await collectionsBtn.count() > 0) {
  await collectionsBtn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/Users/timocorvinus/Desktop/ImageStudio/screenshots/04-collections.png' });
  // Close
  const closeBtn2 = page.locator('.fixed.inset-0').first();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// Screenshot 5: Check the aspect ratio dropdown
const aspectBtn = page.locator('button:has-text("1:1")');
if (await aspectBtn.count() > 0) {
  await aspectBtn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/Users/timocorvinus/Desktop/ImageStudio/screenshots/05-aspect-dropdown.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// Final clean state
await page.screenshot({ path: '/Users/timocorvinus/Desktop/ImageStudio/screenshots/06-final.png' });

console.log('Screenshots saved to screenshots/ directory');
await browser.close();
