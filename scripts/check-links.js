#!/usr/bin/env node
/* 秒级链接检查：抓 public 下所有 HTML 的 href/src，验证内部目标存在。
 * 用法：node scripts/check-links.js   （改完随手跑，提交前必过）
 */
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..','public');
let bad=0, total=0;

function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>
    e.isDirectory()? walk(path.join(dir,e.name))
    : e.name.endsWith('.html')? [path.join(dir,e.name)] : []);
}
const ATTR=/(?:href|src)\s*=\s*["']([^"']+)["']/g;

for(const file of walk(ROOT)){
  const html=fs.readFileSync(file,'utf8');
  const dir = path.dirname(file);
  let m;
  while((m=ATTR.exec(html))){
    let u=m[1].trim();
    // 跳过：空、锚点、外链、协议、JS模板变量、mailto、data URI
    if(!u || u.startsWith('#') || /^[a-z]+:/i.test(u) || u.startsWith('//')) continue;
    if(u.includes('${')) continue; // JS 模板字符串
    if(u.startsWith('data:')) continue;
    u=u.split('#')[0].split('?')[0];
    if(!u) continue;
    // 相对路径：以 HTML 文件所在目录为基准
    const p = path.resolve(dir, u.replace(/^\//,''));
    total++;
    if(!fs.existsSync(p)){ console.error(`✗ ${path.relative(ROOT,file)} -> ${u}`); bad++; }
  }
}
console.log(bad? `\n${bad}/${total} 个失效链接` : `✓ 所有 ${total} 个内部链接有效`);
process.exit(bad?1:0);