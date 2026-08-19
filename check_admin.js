const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  console.log("Navigating to /admin...");
  await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle0' });
  
  // type pin
  console.log("Logging in as admin...");
  await page.type('input[type="password"]', '1234');
  await page.click('button[type="submit"]');
  
  // wait a bit
  await new Promise(r => setTimeout(r, 2000));
  
  // check if crash occurred
  const html = await page.content();
  if (html.includes('went wrong')) {
    console.log("Crash detected on admin page!");
  } else {
    console.log("No crash detected on admin page.");
  }
  
  await browser.close();
})();
