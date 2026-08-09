#!/usr/bin/env node
/**
 * sky-blog 全量截图脚本（13 张，对应 README）
 * 字体已切国内 CDN（fonts.googleapis.cn），不拦截字体请求。
 */
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { try { ({ chromium } = require('/tmp/node_modules/playwright')); }
catch (_2) { console.error('❌ 找不到 playwright'); process.exit(1); } }
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:8322';
const PIC_DIR = path.join(__dirname, '..', 'screenshots');
const AUTH = { username: 'admin', password: 'admin' };

function findChrome() {
  const root = path.join(process.env.HOME || '/root', '.cache/ms-playwright');
  if (!fs.existsSync(root)) return undefined;
  const dirs = fs.readdirSync(root)
    .filter(d => d.startsWith('chromium-') && !d.includes('headless'))
    .map(d => ({ d, p: path.join(root, d, 'chrome-linux64/chrome') }))
    .filter(x => fs.existsSync(x.p))
    .sort((a, b) => b.d.localeCompare(a.d));
  return dirs[0] ? dirs[0].p : undefined;
}

async function stopAnimations(page) {
  await page.evaluate(() => {
    const maxId = window.setTimeout(() => {}, 0);
    for (let i = 0; i <= maxId; i++) { window.clearTimeout(i); window.clearInterval(i); }
    document.querySelectorAll('*').forEach(el => {
      el.style.animationPlayState = 'paused';
      el.style.transition = 'none';
    });
  });
}

async function shot(page, name, { fullPage = false, wait = 2500 } = {}) {
  await page.waitForTimeout(wait);
  try { await stopAnimations(page); } catch (_) {}
  await page.waitForTimeout(300);
  const f = path.join(PIC_DIR, name);
  await page.screenshot({ path: f, fullPage });
  const sz = fs.statSync(f).size;
  console.log(`  ✅ ${name}  (${(sz / 1024).toFixed(1)} KB)`);
}

async function main() {
  fs.mkdirSync(PIC_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: findChrome(),
    args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  // ===== 登录，拿 token =====
  const token = await (async () => {
    const p = await context.newPage();
    await p.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const r = await p.evaluate(async (base) => {
      const res = await fetch(base + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin' }),
      });
      return res.json();
    }, BASE);
    await p.close();
    return r && r.token;
  })();
  if (!token) { console.error('❌ 登录失败'); process.exit(1); }
  console.log('登录 token:', token);

  // ===== 前台：首页四段 + 列表 + 详情 + 登录页 =====
  console.log('\n--- 前台 ---');
  const home = await context.newPage();
  await home.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await home.waitForTimeout(4000);

  // 四段：滚动到各 section 后截视口
  for (const [name, sel] of [
    ['01-home-dawn.png', '#dawn'],
    ['02-home-day.png', '#day'],
    ['03-home-dusk.png', '#dusk'],
    ['04-home-night.png', '#night'],
  ]) {
    await home.evaluate((s) => {
      const el = document.querySelector(s);
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
      window.scrollTo(0, el ? el.offsetTop : 0);
    }, sel);
    await shot(home, name, { wait: 1800 });
  }
  await home.close();

  const posts = await context.newPage();
  await posts.goto(BASE + '/posts.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await shot(posts, '05-posts-list.png', { fullPage: true, wait: 3000 });
  await posts.close();

  const post = await context.newPage();
  await post.goto(BASE + '/post.html?id=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await shot(post, '06-post-detail.png', { fullPage: true, wait: 3000 });
  await post.close();

  const login = await context.newPage();
  await login.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await shot(login, '07-login.png', { wait: 2000 });
  await login.close();

  // ===== 后台：注入 token 后访问 =====
  console.log('\n--- 后台 ---');
  const admin = await context.newPage();
  // 先开一次同源页面才能写 localStorage
  await admin.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await admin.evaluate((t) => localStorage.setItem('app_token', t), token);

  const adminPages = [
    ['08-admin-dashboard.png', '/admin/index.html'],
    ['09-admin-posts.png', '/admin/posts.html'],
    ['10-admin-categories.png', '/admin/categories.html'],
    ['11-admin-slides.png', '/admin/slides.html'],
    ['12-admin-config.png', '/admin/config.html'],
    ['13-admin-editor.html'.replace('.html', '.png'), '/admin/editor.html'],
  ];
  for (const [name, url] of adminPages) {
    await admin.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await shot(admin, name, { fullPage: true, wait: 3000 });
  }
  await admin.close();

  await browser.close();
  console.log('\n✅ 全部完成:', PIC_DIR);
}

main().catch(e => { console.error('❌ 失败:', e.message); process.exit(1); });
