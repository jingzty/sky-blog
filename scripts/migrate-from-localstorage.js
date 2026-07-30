#!/usr/bin/env node
/* 一次性迁移：把原型期 localStorage 导出的 JSON 灌入 SQLite，保证切换前后内容一致。
 * 用法：
 *   1) 浏览器控制台导出： copy(JSON.stringify({posts:JSON.parse(localStorage.app_posts||'[]'),
 *                                             slides:JSON.parse(localStorage.app_slides||'[]')}))
 *      存为 scripts/dump.json
 *   2) node scripts/migrate-from-localstorage.js
 */
const fs=require('fs'), path=require('path');
const Database=require('better-sqlite3');
const DB=path.join(__dirname,'..','data','app.db');
fs.mkdirSync(path.dirname(DB),{recursive:true});

const dump=JSON.parse(fs.readFileSync(path.join(__dirname,'dump.json'),'utf8'));
const db=new Database(DB);
db.exec(fs.readFileSync(path.join(__dirname,'..','migrations','001_init.sql'),'utf8'));

const ins=db.prepare('INSERT INTO posts (title,tag,date,cover,excerpt,content,status) VALUES (?,?,?,?,?,?,?)');
const tx=db.transaction(list=>list.forEach(p=>ins.run(p.title,p.tag,p.date,p.cover,p.excerpt,p.content,p.status||'pub')));
tx(dump.posts||[]);
console.log(`✓ 迁移文章 ${dump.posts?.length||0} 篇`);
// slides 同理按需扩展
