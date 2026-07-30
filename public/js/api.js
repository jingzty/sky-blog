/* 数据层：页面只依赖这里的接口，不关心实现。
 * 内置两套同签名实现：localStorage（原型期）/ fetch（后端期），用 MODE 一键切换。
 * 方法名 = 契约 C 的业务动作；字段名 = 契约 B。页面里绝不直接写 fetch / localStorage。
 */
window.API = (function(){
  const MODE = new URLSearchParams(location.search).get('mode')
            || localStorage.getItem('api_mode')
            || 'remote';
  const TOKEN_KEY = 'app_token';
  const LS_POSTS  = 'app_posts';
  const LS_CATS   = 'app_categories';
  const LS_SLIDES = 'app_slides';
  const LS_CONFIG = 'app_config';
  const LS_USERS  = 'app_users';

  /* ---------- 共用：token ---------- */
  const token    = () => localStorage.getItem(TOKEN_KEY) || '';
  const setToken = t  => localStorage.setItem(TOKEN_KEY, t);
  const clearToken = ()=> localStorage.removeItem(TOKEN_KEY);
  const isAuthed = () => !!token();

  /* ---------- 种子数据 ---------- */
  const defaultConfig = {
    blogName: '远远的天空', blogSubtitle: '一次从黎明到星夜的漫游',
    authorName: '远远', authorRole: '天空观察员 / 写作者',
    authorBio: '热爱天空的人。写代码，也写文字；走山路，也走心路。在这片博客的天空下，记录每一个值得珍藏的瞬间与思考。',
    authorAvatar: 'images/avatar.jpg',
    githubUrl: 'https://github.com', weiboUrl: '', contactEmail: 'hello@sky.blog',
    footerText: '© 2026 远远的天空 · 一次从黎明到星夜的漫游 · Designed with care'
  };

  const defaultCategories = [
    {id:1,name:'全部',description:'所有的云，所有的字',color:'s1',sortOrder:1},
    {id:2,name:'随笔',description:'碎碎念与心事',color:'s2',sortOrder:2},
    {id:3,name:'技术',description:'代码、架构与思考',color:'s3',sortOrder:3},
    {id:4,name:'生活',description:'日常里的光',color:'s4',sortOrder:4},
    {id:5,name:'旅行',description:'山路与远方',color:'s5',sortOrder:5},
    {id:6,name:'读书',description:'纸页之间的对话',color:'s6',sortOrder:6},
    {id:7,name:'创作',description:'颜色与形状',color:'s7',sortOrder:7}
  ];

  const defaultPosts = [
    {id:1,title:'在代码与星空之间',slug:'code-and-stars',excerpt:'当深夜的屏幕亮起，代码如星辰般排列。我们在逻辑的宇宙中寻找意义，也在这片沉默的星空下，找到内心的平静。',cover:'images/article-tech.jpg',date:'2026-07-28',tag:'前端,深夜,思考',content:'## 在代码与星空之间\n\n当深夜的屏幕亮起，代码如星辰般排列。我们在逻辑的宇宙中寻找意义，也在这片沉默的星空下，找到内心的平静。\n\n### 凌晨三点的编辑器\n\n光标在屏幕上闪烁，像一个孤独的灯塔。每一个函数、每一个变量，都是我与机器之间的对话。\n\n有时候会想，代码到底是什么？是指令的集合，还是思维的延伸？当我们在键盘上敲下每一行，我们其实是在用一种特殊的语言，与世界对话。\n\n### 星空下的思考\n\n推开窗户，夜空中有几颗星星在闪烁。它们的光走了几百万年，只为在此刻落入我的眼底。代码又何尝不是这样——每一行都可能在未来某个时刻，在某个人的屏幕上亮起。\n\n这就是我们写代码的意义。',status:'pub',categoryId:3,createdAt:'2026-07-28T00:00:00Z',updatedAt:'2026-07-28T00:00:00Z'},
    {id:2,title:'秋日山行：云海之上的清晨',slug:'autumn-mountain',excerpt:'凌晨四点出发，踏着星光攀登。当第一缕阳光穿透云海，所有疲惫都在那一刻消融。',cover:'images/article-travel.jpg',date:'2026-07-20',tag:'登山,云海,秋天',content:'## 秋日山行：云海之上的清晨\n\n凌晨四点出发，踏着星光攀登。当第一缕阳光穿透云海，所有疲惫都在那一刻消融。\n\n### 出发\n\n山里的凌晨是安静的，只有头灯的光束在黑暗中划出一条路。脚下的碎石发出沙沙的声响，伴着自己的呼吸声，成了这段路唯一的背景音乐。\n\n### 云海之上\n\n六点二十分，我们到达了山顶。此时天边已经泛起了鱼肚白。云海在脚下翻涌，像一片白色的海洋。远处的山峰像是海中的岛屿，若隐若现。\n\n当第一缕阳光穿过云层，整个世界都染上了金色。那一刻，所有的疲惫都消失了。',status:'pub',categoryId:5,createdAt:'2026-07-20T00:00:00Z',updatedAt:'2026-07-20T00:00:00Z'},
    {id:3,title:'读书札记：一个人的村庄',slug:'reading-village',excerpt:'刘亮程笔下那个叫黄沙梁的村庄，是每个人心中永远的故乡。',cover:'images/article-reading.jpg',date:'2026-07-15',tag:'读书,刘亮程,故乡',content:'## 读书札记：一个人的村庄\n\n刘亮程笔下那个叫黄沙梁的村庄，是每个人心中永远的故乡。\n\n### 关于村庄\n\n黄沙梁不是一个具体的地方，它是一种状态。是那种午后的阳光洒在土墙上，是风吹过麦田的沙沙声，是黄昏时分炊烟升起的味道。\n\n每个人心中都有一个黄沙梁。它可能是一个真实的村庄，也可能只是一段记忆，一种感觉。\n\n### 关于时间\n\n在村庄里，时间是以另一种方式流淌的。不是时钟的滴答声，而是庄稼的生长，季节的更替，老屋的腐朽。\n\n读完这本书，我突然很想念那个我已经很久没有回去的地方。',status:'pub',categoryId:6,createdAt:'2026-07-15T00:00:00Z',updatedAt:'2026-07-15T00:00:00Z'},
    {id:4,title:'城市夜色：凌晨四点的天际线',slug:'city-skyline',excerpt:'城市在深夜褪去喧嚣，露出骨骼般的轮廓。那些亮着的窗口，每一扇后面都是一个未眠的故事。',cover:'images/article-city.jpg',date:'2026-07-08',tag:'城市,深夜,观察',content:'## 城市夜色：凌晨四点的天际线\n\n城市在深夜褪去喧嚣，露出骨骼般的轮廓。那些亮着的窗口，每一扇后面都是一个未眠的故事。\n\n### 凌晨四点的城市\n\n凌晨四点的城市是一天中最安静的时候。街道上几乎没有车，路灯的光晕在薄雾中扩散开来。远处的天际线清晰可见，像一幅剪影画。\n\n有些窗口还亮着灯。那些灯光背后，可能是加班到深夜的程序员，可能是照顾婴儿的新手父母，也可能是失眠的老人在看书。\n\n每一扇亮着的窗，都是一个未眠的故事。',status:'pub',categoryId:4,createdAt:'2026-07-08T00:00:00Z',updatedAt:'2026-07-08T00:00:00Z'},
    {id:5,title:'那棵站在山顶的树',slug:'tree-on-hill',excerpt:'它独自站在那里，不知道站了多少年，始终向着天空沉默生长。',cover:'images/article-nature.jpg',date:'2026-06-28',tag:'自然,树木,随笔',content:'## 那棵站在山顶的树\n\n它独自站在那里，不知道站了多少年，始终向着天空沉默生长。\n\n每次爬山，我都会在那棵树下坐一会儿。它是一棵老松树，树干粗壮，需要两个人才能合抱。它的枝叶向着天空伸展，像一把撑开的大伞。\n\n一个人站在山顶，是一种孤独。一棵树站在山顶，是一种坚持。\n\n它不说话，但我觉得它什么都懂。',status:'pub',categoryId:2,createdAt:'2026-06-28T00:00:00Z',updatedAt:'2026-06-28T00:00:00Z'},
    {id:6,title:'用水彩记录天空的颜色',slug:'watercolor-sky',excerpt:'调色盘上是未完成的黎明。一笔钴蓝，一笔藤黄，水与色在纸上交融的瞬间，天空便以另一种方式留存在了画本里。',cover:'images/article-creative.jpg',date:'2026-06-20',tag:'水彩,绘画,天空',content:'## 用水彩记录天空的颜色\n\n调色盘上是未完成的黎明。一笔钴蓝，一笔藤黄，水与色在纸上交融的瞬间，天空便以另一种方式留存在了画本里。\n\n### 为什么要画天空\n\n天空是最难画的。因为它时刻在变，而且没有固定的形状。但也正因为如此，每一次画天空都是独一无二的。\n\n我用水彩画天空，是因为水的流动和颜色的融合，最能表现天空的那种温柔和变幻。\n\n### 调色秘诀\n\n黎明的天空：钴蓝 + 藤黄 + 一点点玫瑰红\n正午的天空：天蓝 + 白色 + 一点点群青\n黄昏的天空：橙黄 + 玫红 + 一点点紫色\n星夜的天空：深蓝 + 黑色 + 一点点金色',status:'pub',categoryId:7,createdAt:'2026-06-20T00:00:00Z',updatedAt:'2026-06-20T00:00:00Z'},
    {id:7,title:'前端开发的黄昏与黎明',slug:'frontend-dusk-dawn',excerpt:'技术在更替，框架在迭代，但有些东西是永恒不变的——比如对美好用户体验的追求。',cover:'images/article-tech.jpg',date:'2026-06-12',tag:'前端,思考,技术趋势',content:'## 前端开发的黄昏与黎明\n\n技术在更替，框架在迭代，但有些东西是永恒不变的——比如对美好用户体验的追求。\n\n### 框架的更替\n\n从 jQuery 到 React，从 Vue 到 Svelte，前端框架的更替速度令人眼花缭乱。每次新框架出现，都有人说这是"黎明"，而旧框架则是"黄昏"。\n\n但我觉得，没有永远的黎明，也没有永远的黄昏。技术的价值不在于它有多新，而在于它解决了什么问题。\n\n### 不变的东西\n\n无论框架怎么变，有几样东西是不变的：\n- 对用户体验的追求\n- 对性能的优化\n- 对代码可维护性的关注\n- 对Web标准的尊重\n\n这些才是前端开发的永恒主题。',status:'pub',categoryId:3,createdAt:'2026-06-12T00:00:00Z',updatedAt:'2026-06-12T00:00:00Z'},
    {id:8,title:'五月的一次徒步',slug:'may-hiking',excerpt:'五月的山是绿色的。新叶像刚洗过的，在阳光下闪闪发光。',cover:'images/article-nature.jpg',date:'2026-05-18',tag:'徒步,五月,自然',content:'## 五月的一次徒步\n\n五月的山是绿色的。新叶像刚洗过的，在阳光下闪闪发光。\n\n一路上遇到了很多野花，有紫色的、白色的、黄色的，叫不出名字，但都很好看。\n\n徒步的意义不在于到达终点，而在于路上的风景。',status:'pub',categoryId:5,createdAt:'2026-05-18T00:00:00Z',updatedAt:'2026-05-18T00:00:00Z'},
    {id:9,title:'读《百年孤独》有感',slug:'hundred-years',excerpt:'马尔克斯说，生命中有过的所有灿烂，终将需要用寂寞来偿还。',cover:'images/article-reading.jpg',date:'2026-05-05',tag:'读书,马尔克斯,文学',content:'## 读《百年孤独》有感\n\n马尔克斯说，生命中有过的所有灿烂，终将需要用寂寞来偿还。\n\n### 关于孤独\n\n布恩迪亚家族的每个人都是孤独的，尽管他们生活在同一个屋檐下。这种孤独不是物理上的隔离，而是精神上的无法沟通。\n\n读完这本书，我一直在想：我们是不是也在经历着同样的孤独？\n\n### 关于时间\n\n小说中的时间不是线性的，而是循环的。过去、现在和未来交织在一起，像一条咬住自己尾巴的蛇。\n\n这让我想到了博客——写下的文字，也是一种对抗时间的方式。',status:'pub',categoryId:6,createdAt:'2026-05-05T00:00:00Z',updatedAt:'2026-05-05T00:00:00Z'},
    {id:10,title:'四月的雨',slug:'april-rain',excerpt:'四月的雨是温柔的，它不打伞，也不扰人，只是静静地飘着。',cover:'images/article-city.jpg',date:'2026-04-22',tag:'雨,四月,生活',content:'## 四月的雨\n\n四月的雨是温柔的，它不打伞，也不扰人，只是静静地飘着。\n\n窗外的雨声像一首催眠曲。我坐在窗前，看着雨滴沿着玻璃滑落，每一滴都走着自己的路，最后汇入同一条水流。\n\n人也一样吧。各自有不同的轨迹，但最终都会去向同一个方向。',status:'pub',categoryId:2,createdAt:'2026-04-22T00:00:00Z',updatedAt:'2026-04-22T00:00:00Z'},
    {id:11,title:'三月：春天的第一声鸟鸣',slug:'march-birds',excerpt:'清晨六点，窗外传来一声鸟鸣。那是春天的第一个信号。',cover:'images/article-nature.jpg',date:'2026-03-15',tag:'春天,鸟鸣,生活',content:'## 三月：春天的第一声鸟鸣\n\n清晨六点，窗外传来一声鸟鸣。那是春天的第一个信号。\n\n冬天终于过去了。树枝上开始冒出嫩芽，空气中有了泥土的气息。\n\n春天是一个适合重新开始的季节。',status:'pub',categoryId:4,createdAt:'2026-03-15T00:00:00Z',updatedAt:'2026-03-15T00:00:00Z'},
    {id:12,title:'二月：春节的炉火',slug:'feb-fire',excerpt:'老家的炉子里烧着柴火，火光映在每个人的脸上，温暖而安宁。',cover:'images/article-city.jpg',date:'2026-02-10',tag:'春节,家乡,炉火',content:'## 二月：春节的炉火\n\n老家的炉子里烧着柴火，火光映在每个人的脸上，温暖而安宁。\n\n春节是唯一一个让人想要回家的节日。无论多远，无论多忙，到了这一天，人都会想尽办法回到那个叫做"家"的地方。\n\n炉火噼啪作响，像是在讲述着一年来的故事。',status:'pub',categoryId:4,createdAt:'2026-02-10T00:00:00Z',updatedAt:'2026-02-10T00:00:00Z'},
    {id:13,title:'一月：新年计划',slug:'jan-plan',excerpt:'新的一年开始了。我列出了今年的计划，其中第一条就是：多写博客。',cover:'images/article-creative.jpg',date:'2026-01-05',tag:'新年,计划,随笔',content:'## 一月：新年计划\n\n新的一年开始了。我列出了今年的计划，其中第一条就是：多写博客。\n\n为什么要写博客？因为写作是一种思考。当你把想法写下来的时候，你才真正开始理解它。\n\n希望这一年，能在这片天空下记录更多。',status:'pub',categoryId:2,createdAt:'2026-01-05T00:00:00Z',updatedAt:'2026-01-05T00:00:00Z'},
    {id:14,title:'冬日星空摄影指南',slug:'winter-stars',excerpt:'冬天是拍摄星空最好的季节。空气清冽，能见度高，银河清晰可见。',cover:'images/article-creative.jpg',date:'2025-12-20',tag:'摄影,星空,冬天',content:'## 冬日星空摄影指南\n\n冬天是拍摄星空最好的季节。空气清冽，能见度高，银河清晰可见。\n\n### 器材准备\n\n- 相机：最好是全画幅\n- 镜头：大光圈广角（f/2.8或更大）\n- 三脚架：必须的\n- 快门线：避免手抖\n\n### 拍摄技巧\n\n- 使用手动对焦，对焦到无穷远\n- 曝光时间不超过500/焦距（避免星轨）\n- ISO 1600-3200\n- 使用RAW格式\n\n### 后期处理\n\n在Lightroom中调整白平衡、增加对比度、降噪。星空摄影的后期处理是必不可少的。',status:'pub',categoryId:7,createdAt:'2025-12-20T00:00:00Z',updatedAt:'2025-12-20T00:00:00Z'},
    {id:15,title:'十一月的落叶',slug:'nov-leaves',excerpt:'路边的银杏树落了一地的金黄，踩上去沙沙作响。',cover:'images/article-nature.jpg',date:'2025-11-18',tag:'秋天,落叶,随笔',content:'## 十一月的落叶\n\n路边的银杏树落了一地的金黄，踩上去沙沙作响。\n\n秋天是一个让人感伤的季节。但其实，落叶并不是结束，而是为来年的新芽做准备。\n\n人也一样，有时候需要放下一些东西，才能迎接新的开始。',status:'pub',categoryId:2,createdAt:'2025-11-18T00:00:00Z',updatedAt:'2025-11-18T00:00:00Z'},
    {id:16,title:'十月的黄昏',slug:'oct-dusk',excerpt:'十月的黄昏是最美的。天空被染成橘红色，然后慢慢变紫，最后沉入黑暗。',cover:'images/article-city.jpg',date:'2025-10-25',tag:'黄昏,十月,观察',content:'## 十月的黄昏\n\n十月的黄昏是最美的。天空被染成橘红色，然后慢慢变紫，最后沉入黑暗。\n\n我坐在阳台上，看着天色一点点变化。这个过程大概持续了四十分钟。\n\n四十分钟里，天空的颜色变化了无数次。每一秒都是独一无二的。\n\n如果人生也是这样——每一刻都不可复制，那我们是不是应该更加珍惜当下？',status:'pub',categoryId:4,createdAt:'2025-10-25T00:00:00Z',updatedAt:'2025-10-25T00:00:00Z'},
    {id:17,title:'草稿：关于博客的思考',slug:'draft-blog-thoughts',excerpt:'这是一篇还没写完的草稿……',cover:'',date:'2026-07-29',tag:'博客,思考',content:'## 关于博客的思考\n\n为什么要写博客？\n\n### 写作是一种思考\n\n当你把想法写下来的时候，你才真正开始理解它。\n\n### 写作是一种分享\n\n（未完待续……）',status:'draft',categoryId:2,createdAt:'2026-07-29T00:00:00Z',updatedAt:'2026-07-29T00:00:00Z'}
  ];

  const defaultSlides = [
    {id:1,postId:2,tag:'旅行手记 · 黎明',title:'在云海之上，遇见黎明',description:'凌晨四点的山巅，等待第一缕光。当云海翻涌、金光铺满天地，你会明白，有些风景值得所有跋涉。',bgImage:'images/hero-dawn.jpg',sortOrder:1,status:'active'},
    {id:2,postId:1,tag:'生活感悟 · 云海',title:'穿越云层，看见更远的天空',description:'有时候我们需要升高一些，越过眼前的迷雾，才能看见更辽阔的天地，和更清晰的自己。',bgImage:'images/hero-clouds.jpg',sortOrder:2,status:'active'},
    {id:3,postId:14,tag:'夜空随笔 · 星夜',title:'银河之下，我们都是赶路的人',description:'抬头仰望星空，那些光走了千万年才抵达眼底。在浩瀚面前，所有的烦恼都变得渺小而温柔。',bgImage:'images/hero-night.jpg',sortOrder:3,status:'active'}
  ];

  const defaultUsers = [
    {id:1,username:'admin',password:'admin'}
  ];

  function seedIfEmpty(){
    if(!localStorage.getItem(LS_POSTS)){ write(LS_POSTS, defaultPosts); }
    if(!localStorage.getItem(LS_CATS)){ write(LS_CATS, defaultCategories); }
    if(!localStorage.getItem(LS_SLIDES)){ write(LS_SLIDES, defaultSlides); }
    if(!localStorage.getItem(LS_CONFIG)){ write(LS_CONFIG, defaultConfig); }
    if(!localStorage.getItem(LS_USERS)){ write(LS_USERS, defaultUsers); }
  }

  /* ---------- 工具 ---------- */
  const read  = k => JSON.parse(localStorage.getItem(k) || '[]');
  const readObj = k => JSON.parse(localStorage.getItem(k) || '{}');
  const write = (k,v) => localStorage.setItem(k, JSON.stringify(v));
  const nid   = list => list.reduce((m,p)=>Math.max(m,p.id||0),0)+1;

  /* ---------- local 实现 ---------- */
  const local = {
    /* 认证 */
    async login(u,p){
      const users = read(LS_USERS);
      const user = users.find(x=>x.username===u&&x.password===p);
      if(user){ setToken('local-'+Date.now()); return {ok:true,token:'local-'+Date.now()}; }
      throw new Error('用户名或密码错误');
    },
    async check(){ return {valid:isAuthed()}; },

    /* 文章 */
    async getPosts(params={}){
      let posts = read(LS_POSTS);
      if(!params.all){ posts = posts.filter(p=>p.status==='pub'); }
      if(params.categoryId){ posts = posts.filter(p=>p.categoryId==params.categoryId); }
      if(params.tag){ posts = posts.filter(p=>p.tag&&p.tag.split(',').map(s=>s.trim()).includes(params.tag)); }
      if(params.q){ const q=params.q.toLowerCase(); posts=posts.filter(p=>p.title.toLowerCase().includes(q)||p.excerpt.toLowerCase().includes(q)||p.content.toLowerCase().includes(q)); }
      if(params.month){ posts = posts.filter(p=>p.date&&p.date.startsWith(params.month)); }
      posts.sort((a,b)=>b.date.localeCompare(a.date));
      return posts;
    },
    async getPost(idOrSlug){
      const posts = read(LS_POSTS);
      const p = posts.find(x=>x.id==idOrSlug||x.slug===idOrSlug);
      if(!p) throw new Error('文章不存在');
      return p;
    },
    async createPost(d){
      const posts = read(LS_POSTS);
      const slug = d.slug || d.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').toLowerCase() || ('post-'+Date.now());
      const p = {id:nid(posts),slug,status:'draft',cover:'',tag:'',categoryId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),...d};
      posts.unshift(p); write(LS_POSTS,posts); return p;
    },
    async updatePost(id,d){
      const posts = read(LS_POSTS);
      const i = posts.findIndex(x=>x.id==id);
      if(i<0) throw new Error('文章不存在');
      posts[i] = {...posts[i],...d,updatedAt:new Date().toISOString()};
      write(LS_POSTS,posts); return posts[i];
    },
    async setPostStatus(id,s){
      const posts = read(LS_POSTS);
      const i = posts.findIndex(x=>x.id==id);
      if(i<0) throw new Error('文章不存在');
      posts[i].status = s; posts[i].updatedAt = new Date().toISOString();
      write(LS_POSTS,posts); return posts[i];
    },
    async deletePost(id){
      write(LS_POSTS, read(LS_POSTS).filter(x=>x.id!=id));
      return {ok:true};
    },

    /* 分类 */
    async getCategories(){
      const cats = read(LS_CATS);
      cats.sort((a,b)=>a.sortOrder-b.sortOrder);
      return cats;
    },
    async createCategory(d){
      const cats = read(LS_CATS);
      const c = {id:nid(cats),sortOrder:cats.length+1,...d};
      cats.push(c); write(LS_CATS,cats); return c;
    },
    async updateCategory(id,d){
      const cats = read(LS_CATS);
      const i = cats.findIndex(x=>x.id==id);
      if(i<0) throw new Error('分类不存在');
      cats[i] = {...cats[i],...d}; write(LS_CATS,cats); return cats[i];
    },
    async deleteCategory(id){
      write(LS_CATS, read(LS_CATS).filter(x=>x.id!=id));
      return {ok:true};
    },

    /* 轮播 */
    async getSlides(params={}){ const all=read(LS_SLIDES).sort((a,b)=>a.sortOrder-b.sortOrder); if(params.all) return all; return all.filter(s=>s.status==='active'); },
    async getSlidesAll(all){ return local.getSlides({all}); },
    async saveSlides(list){ write(LS_SLIDES,list); return {ok:true}; },

    /* 站点配置 */
    async getConfig(){ return readObj(LS_CONFIG); },
    async updateConfig(d){ const cfg = {...readObj(LS_CONFIG),...d}; write(LS_CONFIG,cfg); return cfg; },

    /* 搜索 */
    async search(q){ return local.getPosts({q,all:false}); }
  };

  /* ---------- remote 实现 ---------- */
  async function request(method,url,body){
    const opts={method,headers:{}};
    if(body!==undefined){ opts.headers['Content-Type']='application/json'; opts.body=JSON.stringify(body); }
    if(token()) opts.headers['Authorization']='Bearer '+token();
    const res=await fetch(url,opts);
    const data=await res.json().catch(()=>null);
    if(!res.ok) throw new Error((data&&data.error)||`请求失败 (${res.status})`);
    return data;
  }
  const remote = {
    login:async(u,p)=>{const r=await request('POST','/api/login',{username:u,password:p});if(r&&r.token){setToken(r.token);}return r;},
    check:()=>request('GET','/api/check'),
    getPosts:(params={})=>{
      const qs = new URLSearchParams();
      if(params.all) qs.set('all','1');
      if(params.categoryId) qs.set('categoryId',params.categoryId);
      if(params.tag) qs.set('tag',params.tag);
      if(params.q) qs.set('q',params.q);
      if(params.month) qs.set('month',params.month);
      const q = qs.toString();
      return request('GET','/api/posts'+(q?'?'+q:''));
    },
    getPost:(id)=>request('GET','/api/posts/'+id),
    createPost:(d)=>request('POST','/api/posts',d),
    updatePost:(id,d)=>request('PUT','/api/posts/'+id,d),
    setPostStatus:(id,s)=>request('PATCH','/api/posts/'+id+'/status',{status:s}),
    deletePost:(id)=>request('DELETE','/api/posts/'+id),
    getCategories:()=>request('GET','/api/categories'),
    createCategory:(d)=>request('POST','/api/categories',d),
    updateCategory:(id,d)=>request('PUT','/api/categories/'+id,d),
    deleteCategory:(id)=>request('DELETE','/api/categories/'+id),
    getSlides:(params={})=>request('GET','/api/slides'+(params.all?'?all=1':'')),
    saveSlides:(l)=>request('PUT','/api/slides',l),
    getConfig:()=>request('GET','/api/config'),
    updateConfig:(d)=>request('PUT','/api/config',d),
    search:(q)=>request('GET','/api/search?q='+encodeURIComponent(q)),
  };

  /* ---------- 导出 ---------- */
  const impl = MODE==='remote' ? remote : local;
  const api = Object.assign({}, impl, { isAuthed, setToken, clearToken, MODE });
  seedIfEmpty();
  return api;
})();