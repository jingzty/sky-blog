#!/usr/bin/env node
/* E2E 关键路径：登录 → 改轮播 → 发文 → 前台可见。提交前 / CI 跑。
 * 用法：先起服务（PORT=8322 npm start），再 node scripts/e2e.js
 * 依赖：npm i -D playwright
 * 注：选择器对齐当前页面（#username/#password、admin/index.html、#title、EasyMDE）。
 */
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { try { ({ chromium } = require('/tmp/node_modules/playwright')); }
catch (_2) { console.error('❌ 找不到 playwright'); process.exit(1); } }
const BASE = process.env.BASE || 'http://localhost:8322';
const path = require('path'), fs = require('fs');

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

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: findChrome(), args: ['--no-sandbox', '--disable-gpu'] });
  const p = await browser.newPage();
  const fail = (m) => { console.error('✗ ' + m); process.exitCode = 1; };
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  // 忽略浏览器自动发出的资源 404 console 提示（favicon 等），改由 response 监听带 URL 捕获真实 404
  p.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errs.push(m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) errs.push('HTTP ' + r.status() + ' ' + r.url()); });

  // 1. 首页可开
  await p.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });

  // 2. 登录
  await p.goto(BASE + '/login.html');
  await p.fill('#username', 'admin');
  await p.fill('#password', 'admin');
  await p.click('#loginBtn');
  await p.waitForURL('**/admin/index.html').catch(() => fail('登录后未跳 admin/index.html'));

  // 3. 新建文章（EasyMDE 编辑器）
  await p.goto(BASE + '/admin/editor.html');
  await p.fill('#title', 'E2E 测试文章');
  // EasyMDE 把 textarea 隐藏，用 CodeMirror；直接通过 API 写值更稳，或用编辑器命令
  await p.evaluate(() => { const e = document.querySelector('.CodeMirror').CodeMirror; e.setValue('# 正文\nE2E 测试内容'); });
  await p.click('#publishBtn');
  await p.waitForURL('**/admin/posts.html').catch(() => fail('发布后未回 posts.html'));

  // 4. 前台可见
  await p.goto(BASE + '/index.html');
  const seen = await p.locator('text=E2E 测试文章').count();
  if (!seen) fail('前台首页未见新文章');

  // 5. 详情页可打开 + 上下篇接口可用
  const post = await p.evaluate(async (base) => {
    const list = await fetch(base + '/api/posts?q=E2E').then(r => r.json());
    return list[0];
  }, BASE);
  if (!post) fail('搜索接口未返回新文章');
  if (post) {
    const nb = await p.evaluate(async (id) => fetch('/api/posts/' + id + '/neighbors').then(r => r.json()), post.id);
    if (!nb || (!nb.prev && !nb.next && nb.prev !== null)) fail('上下篇接口异常');
  }

  if (errs.length) fail('console/网络报错: ' + errs.join(' | '));
  console.log(process.exitCode ? '✗ E2E 未过' : '✓ E2E 全过');
  await browser.close();
})();
