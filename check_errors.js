const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

  console.log("Navigating to /admin...");
  await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle0' }).catch(e => console.log(e));
  
  console.log("Navigating to /driver...");
  await page.goto('http://localhost:3000/driver', { waitUntil: 'networkidle0' }).catch(e => console.log(e));
  
  await browser.close();
})();
