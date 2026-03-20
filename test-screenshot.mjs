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
await page.screenshot({ path: '/Users/timocorvinus/Desktop/ImageStudio/screenshot-full.png' });
await browser.close();
