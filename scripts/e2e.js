#!/usr/bin/env node
/* E2E 关键路径：登录 → 改轮播 → 发文 → 前台可见。提交前 / CI 跑。
 * 用法：先起服务，再 node scripts/e2e.js
 * 依赖：npm i -D playwright
 */
const { chromium }=require('playwright');
const BASE=process.env.BASE||'http://localhost:8321';

(async()=>{
  const browser=await chromium.launch();
  const p=await browser.newPage();
  const fail=(m)=>{ console.error('✗ '+m); process.exitCode=1; };

  // 1. 首页可开、无 console error
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
  await p.goto(BASE+'/index.html');
  // 2. 登录
  await p.goto(BASE+'/login.html');
  await p.fill('#fUser','admin'); await p.fill('#fPass','admin');
  await p.click('button[data-action="login"]');
  await p.waitForURL('**/admin.html').catch(()=>fail('登录后未跳 admin'));
  // 3. 新建文章
  await p.goto(BASE+'/editor.html');
  await p.fill('#fTitle','E2E 测试文章');
  await p.fill('#fContent','# 正文\n测试');
  await p.click('button[data-action="publish"]');
  await p.waitForURL('**/admin.html').catch(()=>fail('发布后未回 admin'));
  // 4. 前台可见
  await p.goto(BASE+'/index.html');
  const seen=await p.locator('text=E2E 测试文章').count();
  if(!seen) fail('前台未见新文章');
  if(errs.length) fail('console 报错: '+errs.join(' | '));

  console.log(process.exitCode? '✗ E2E 未过' : '✓ E2E 全过');
  await browser.close();
})();
