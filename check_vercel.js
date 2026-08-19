const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('PAGE LOG ERROR:', msg.text());
    }
  });
  
  page.on('pageerror', err => {
    console.log('PAGE UNCAUGHT ERROR:', err.toString());
  });

  console.log('Navigating to deployed site...');
  await page.goto('https://campus-shuttle-rho.vercel.app/admin', { waitUntil: 'networkidle2' });
  
  // Wait to see if the page renders login
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('Attempting to log in...');
  try {
    const btn = await page.$('button[type="button"]'); // Quick access button
    if (btn) {
      await btn.click();
      console.log('Clicked Quick Access');
    } else {
      await page.type('input[type="password"]', '1234');
      await page.click('button[type="submit"]');
      console.log('Typed PIN 1234 and submitted');
    }
  } catch (e) {
    console.log('Login logic failed:', e.message);
  }
  
  // Wait for the map to load or crash
  await new Promise(r => setTimeout(r, 5000));
  
  const content = await page.content();
  if (content.includes('This page couldn\'t load')) {
    console.log('Error boundary detected in DOM!');
  } else {
    console.log('No error boundary detected.');
  }
  
  await browser.close();
})();
