const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  p.on('console', m => console.log('console:', m.text().slice(0,200)));
  p.on('pageerror', e => console.log('pageerror:', e.message));
  await p.goto('http://localhost:8765/render.html');
  await p.waitForFunction(() => window.ready, null, { timeout: 15000 });
  const shots = JSON.parse(process.argv[2]);
  for (const [name, o] of Object.entries(shots)) {
    const url = await p.evaluate(o => window.renderShot(o), o);
    fs.writeFileSync(name, Buffer.from(url.split(',')[1], 'base64'));
    console.log(name, fs.statSync(name).size);
  }
  await b.close();
})();
