/* 后端：Express 同源托管 静态页 + /api，配 SQLite、登录守卫、种子开关、404 兜底。
 * 前端一律相对路径 /api/...，同源零跨域，反代时前端零改动。
 */
const fs=require('fs'), path=require('path');
const express=require('express');
const Database=require('better-sqlite3');

const PORT=process.env.PORT||8321;
const SEED=process.env.SEED==='1';
const ADMIN_USER=process.env.ADMIN_USER||'admin';
const ADMIN_PASS=process.env.ADMIN_PASS||'admin';

const DB=path.join(__dirname,'data','app.db');
fs.mkdirSync(path.dirname(DB),{recursive:true});
const db=new Database(DB);
db.exec(fs.readFileSync(path.join(__dirname,'migrations','001_init.sql'),'utf8'));

if(SEED && db.prepare('SELECT COUNT(*) c FROM posts').get().c===0){
  db.prepare('INSERT INTO posts (title,tag,date,cover,excerpt,content,status) VALUES (?,?,?,?,?,?,?)')
    .run('示例文章','游记','2026.07.28','', '摘要示例','# 正文\n示例内容','pub');
  console.log('· 已种子示例数据（SEED=1）');
}

const app=express();
app.use(express.json({limit:'1mb'}));

/* 极简 token 守卫 */
const tokens=new Set();
const auth=(req,res,next)=>{ const t=(req.headers.authorization||'').replace('Bearer ','');
  if(!tokens.has(t)) return res.status(401).json({error:'未登录'}); next(); };

/* ---- 契约 C ---- */
app.post('/api/login',(req,res)=>{
  const {username,password}=req.body||{};
  if(username===ADMIN_USER && password===ADMIN_PASS){
    const t='tok_'+Date.now()+Math.random().toString(36).slice(2);
    tokens.add(t); res.json({token:t});
  }else res.status(401).json({error:'账号或密码错误'});
});
app.get('/api/posts',(req,res)=>{
  const rows=req.query.all? db.prepare('SELECT * FROM posts ORDER BY id DESC').all()
                         : db.prepare("SELECT * FROM posts WHERE status='pub' ORDER BY id DESC").all();
  res.json(rows);
});
app.get('/api/posts/:id',(req,res)=>{
  const r=db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
  r? res.json(r) : res.status(404).json({error:'文章不存在'});
});
app.post('/api/posts',auth,(req,res)=>{
  const {title,tag,date,cover,excerpt,content,status='pub'}=req.body||{};
  const r=db.prepare('INSERT INTO posts (title,tag,date,cover,excerpt,content,status) VALUES (?,?,?,?,?,?,?)')
            .run(title,tag,date,cover,excerpt,content,status);
  res.json({id:r.lastInsertRowid,...req.body});
});
app.put('/api/posts/:id',auth,(req,res)=>{
  const {title,tag,date,cover,excerpt,content,status}=req.body||{};
  db.prepare('UPDATE posts SET title=?,tag=?,date=?,cover=?,excerpt=?,content=?,status=? WHERE id=?')
    .run(title,tag,date,cover,excerpt,content,status,req.params.id);
  res.json({ok:true});
});
app.patch('/api/posts/:id/status',auth,(req,res)=>{
  db.prepare('UPDATE posts SET status=? WHERE id=?').run(req.body.status,req.params.id);
  res.json({ok:true});
});
app.delete('/api/posts/:id',auth,(req,res)=>{
  db.prepare('DELETE FROM posts WHERE id=?').run(req.params.id);
  res.json({ok:true});
});
app.get('/api/slides',(req,res)=>res.json(db.prepare('SELECT * FROM slides').all()));
app.put('/api/slides',auth,(req,res)=>{
  db.prepare('DELETE FROM slides').run();
  const ins=db.prepare('INSERT INTO slides (title,img,postId) VALUES (?,?,?)');
  (req.body||[]).forEach(s=>ins.run(s.title,s.img,s.postId));
  res.json({ok:true});
});

/* 静态 + 404 兜底 */
app.use(express.static(path.join(__dirname,'public')));
app.use((req,res)=>res.status(404).sendFile(path.join(__dirname,'public','404.html')));

app.listen(PORT,()=>console.log(`✓ http://localhost:${PORT}`));
