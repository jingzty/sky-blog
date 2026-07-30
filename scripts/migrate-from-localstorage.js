#!/usr/bin/env node
/* 一次性迁移：把原型期 localStorage 导出的 JSON 灌入 SQLite，保证切换前后内容一致。
 * 用法：
 *   1) 浏览器控制台导出：
 *      copy(JSON.stringify({
 *        posts: JSON.parse(localStorage.app_posts||'[]'),
 *        categories: JSON.parse(localStorage.app_categories||'[]'),
 *        slides: JSON.parse(localStorage.app_slides||'[]'),
 *        config: JSON.parse(localStorage.app_config||'{}')
 *      }))
 *      粘贴内容保存为 scripts/dump.json
 *   2) node scripts/migrate-from-localstorage.js
 */
const fs=require('fs'), path=require('path');
const Database=require('better-sqlite3');
const DB=path.join(__dirname,'..','data','app.db');
fs.mkdirSync(path.dirname(DB),{recursive:true});

const dump=JSON.parse(fs.readFileSync(path.join(__dirname,'dump.json'),'utf8'));
const db=new Database(DB);
db.exec(fs.readFileSync(path.join(__dirname,'..','migrations','001_init.sql'),'utf8'));

// 文章
const insPost=db.prepare('INSERT OR IGNORE INTO posts (id,title,slug,excerpt,cover,date,tag,content,status,categoryId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
const txP=db.transaction(list=>list.forEach(p=>{
  const slug=p.slug||(p.title||'').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').toLowerCase();
  insPost.run(p.id,p.title,slug,p.excerpt||'',p.cover||'',p.date||'',p.tag||'',p.content||'',p.status||'pub',p.categoryId||null,p.createdAt||new Date().toISOString(),p.updatedAt||new Date().toISOString());
}));
txP(dump.posts||[]);
console.log(`✓ 迁移文章 ${dump.posts?.length||0} 篇`);

// 分类
if(dump.categories&&dump.categories.length){
  const insCat=db.prepare('INSERT OR IGNORE INTO categories (id,name,description,color,sortOrder) VALUES (?,?,?,?,?)');
  const txC=db.transaction(list=>list.forEach(c=>insCat.run(c.id,c.name,c.description||'',c.color||'',c.sortOrder||0)));
  txC(dump.categories); console.log(`✓ 迁移分类 ${dump.categories.length} 个`);
}

// 轮播
if(dump.slides&&dump.slides.length){
  const insSlide=db.prepare('INSERT OR IGNORE INTO slides (id,postId,tag,title,description,bgImage,sortOrder,status) VALUES (?,?,?,?,?,?,?,?)');
  const txS=db.transaction(list=>list.forEach(s=>insSlide.run(s.id,s.postId,s.tag||'',s.title||'',s.description||'',s.bgImage||'',s.sortOrder||0,s.status||'active')));
  txS(dump.slides); console.log(`✓ 迁移轮播 ${dump.slides.length} 个`);
}

// 配置
if(dump.config&&Object.keys(dump.config).length){
  const insCfg=db.prepare('INSERT OR REPLACE INTO config (key,value) VALUES (?,?)');
  const txCfg=db.transaction(cfg=>{ Object.entries(cfg).forEach(([k,v])=>insCfg.run(k,String(v||''))); });
  txCfg(dump.config); console.log(`✓ 迁移配置 ${Object.keys(dump.config).length} 项`);
}

console.log('迁移完成');
