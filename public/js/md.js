/* 极简 Markdown 渲染：post / editor 共用。支持标题、列表、粗体、斜体、链接、代码块、图片。 */
window.MD = (function(){
  const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  /* 视频扩展名白名单：以这些后缀结尾（忽略 query/fragment）的链接渲染为 <video>。 */
  const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v)(?:[?#]|$)/i;
  function isVideo(u){
    const s = String(u||'').trim();
    return VIDEO_EXT.test(s);
  }
  function videoTag(url, alt){
    const u = safeUrl(url);
    if (u === '#') return '<img src="#" alt="'+esc(alt||'')+'">';
    return '<video controls preload="metadata" playsinline'+
      (alt?' aria-label="'+esc(alt)+'"':'')+
      '><source src="'+u+'"></video>';
  }

  /* B 站视频嵌入：从 bilibili.com/video/BVxxxx 或 /av数字 提取 id，
   * 桌面端构造 player.bilibili.com iframe；移动端 B站播放器 html5 路径需
   * 加载 s1.hdslb.com 脚本 + bilivideo.com 视频流，与本站严格 CSP 不兼容
   * (会报"已阻止此内容")，故移动端改为可点击跳转卡片，点击后到 B站原页观看。 */
  function isBilibili(u){
    return /bilibili\.com\/video\/(BV[0-9A-Za-z]+|av\d+)/i.test(String(u||''));
  }
  function isMobile(){
    return /Mobi|Mobile|iPhone|iPod|Android|Windows Phone|UCWEB/i.test(navigator.userAgent||'');
  }
  function bilibiliTag(url, alt){
    const s = String(url||'').trim();
    let id = '', type = '';
      let m = s.match(/bilibili\.com\/video\/(BV[0-9A-Za-z]+)/i);
      if(m){ id=m[1]; type='bvid'; }
      else { m = s.match(/bilibili\.com\/video\/av(\d+)/i); if(m){ id=m[1]; type='aid'; } }
    if(!id) return '<a href="'+safeUrl(s)+'" target="_blank" rel="noopener">'+esc(alt||s)+'</a>';
    const p = (s.match(/[?&]p=(\d+)/)||[])[1] || '1';
    const t = (s.match(/[?&]t=(\d+)/)||[])[1];
    const watchUrl = 'https://www.bilibili.com/video/'+id+(p&&p!=='1'?'?p='+p:'')+(t?(p&&p!=='1'?'&':'?')+'t='+t:'');
    /* 移动端：跳转卡片（自包含内联样式，复用 16:9 比例与圆角） */
    if(isMobile()){
      const titleTxt = alt ? esc(alt) : '在哔哩哔哩观看';
      const style = 'display:flex;align-items:center;justify-content:center;gap:10px;'+
        'width:100%;aspect-ratio:16/9;border-radius:12px;margin:1.5em 0;'+
        'background:linear-gradient(135deg,#fb7299,#00a1d6);color:#fff;'+
        'text-decoration:none;font-size:1rem;font-weight:600;'+
        'box-shadow:0 4px 16px rgba(0,0,0,0.12);';
      const ico = '<svg width="28" height="28" viewBox="0 0 250 250" fill="currentColor" style="flex-shrink:0"><path d="M250 125C250 194 194 250 125 250S0 194 0 125 56 0 125 0s125 56 125 125zm-38.5-22.5c0-5.5-4.5-10-10-10H175v35h26.5v-25zm-10 22.5H175v35h26.5v-35zm-46.5-22.5c0-5.5-4.5-10-10-10h-26.5c-5.5 0-10 4.5-10 10v60c0 5.5 4.5 10 10 10h26.5c5.5 0 10-4.5 10-10v-60zm-10 60h-26.5v-35h26.5v35zm-46.5-60c0-5.5-4.5-10-10-10H61.5c-5.5 0-10 4.5-10 10v60c0 5.5 4.5 10 10 10H88c5.5 0 10-4.5 10-10v-60zm-10 60H61.5v-35H88v35z"/></svg>';
      return '<a class="bilibili-card" data-bili-id="'+esc(id)+'" href="'+watchUrl+'" target="_blank" rel="noopener" style="'+style+'">'+ico+
        '<span>'+titleTxt+'</span></a>';
    }
    /* 桌面端：iframe 播放器 */
    const q = new URLSearchParams();
    q.set(type, id);
    q.set('page', p);
    q.set('high_quality', '1');
    if(t) q.set('t', t);
    const src = 'https://player.bilibili.com/player.html?'+q.toString();
    return '<iframe class="bilibili-player" src="'+src+'" scrolling="no" '+
      'frameborder="0" framespacing="0" allowfullscreen="true"'+
      (alt?' title="'+esc(alt)+'"':'')+'></iframe>';
  }

  /* 统一媒体标签：视频文件 → <video>；B 站链接 → iframe；否则图片。 */
  function mediaTag(url, alt){
    if (isVideo(url)) return videoTag(url, alt);
    if (isBilibili(url)) return bilibiliTag(url, alt);
    return '<img src="'+safeUrl(url)+'" alt="'+esc(alt||'')+'" loading="lazy">';
  }

  function render(src){
    let html = '';
    const lines = String(src||'').split('\n');
    let inList = false, inCode = false, codeBuf = '', codeLang = '', codeIndent = '';
    let inTable = false, tableRows = [];

    for(let i=0; i<lines.length; i++){
      const raw = lines[i];
      const line = raw.trimEnd();

      // 代码块（围栏允许带前导缩进：AI 生成/粘贴内容常见，CommonMark 亦允许 ≤3 空格）
      const fenceM = line.match(/^(\s*)```/);
      if(fenceM){
        if(inCode){
          html += '<pre><code'+(codeLang?' class="lang-'+esc(codeLang)+'"':'')+'>'+esc(codeBuf.replace(/\n$/,''))+'</code></pre>';
          codeBuf = ''; codeLang = ''; codeIndent = ''; inCode = false;
        } else {
          inCode = true;
          codeIndent = fenceM[1];
          codeLang = line.replace(/^\s*```/,'').trim();
        }
        continue;
      }
      if(inCode){ codeBuf += (codeIndent && raw.startsWith(codeIndent) ? raw.slice(codeIndent.length) : raw)+'\n'; continue; }

      // 空行
      if(!line){
        if(inTable){ html+=renderTable(tableRows); tableRows=[]; inTable=false; }
        if(inList){ html+='</ul>'; inList=false; } continue;
      }

      // 表格行
      if(/^\|/.test(line)){
        if(inList){ html+='</ul>'; inList=false; }
        if(!inTable){ inTable=true; tableRows=[]; }
        tableRows.push(line);
        continue;
      }
      // 不在表格内但遇到非空行，先刷新表格
      if(inTable){ html+=renderTable(tableRows); tableRows=[]; inTable=false; }

      // 标题
      if(/^#### /.test(line)){ if(inList){html+='</ul>';inList=false;} html+='<h4>'+inline(line.slice(5))+'</h4>'; continue; }
      if(/^### /.test(line)){ if(inList){html+='</ul>';inList=false;} html+='<h3>'+inline(line.slice(4))+'</h3>'; continue; }
      if(/^## /.test(line)){ if(inList){html+='</ul>';inList=false;} html+='<h2>'+inline(line.slice(3))+'</h2>'; continue; }
      if(/^# /.test(line)){ if(inList){html+='</ul>';inList=false;} html+='<h1>'+inline(line.slice(2))+'</h1>'; continue; }

      // 水平线
      if(/^(---|\*\*\*|___)$/.test(line)){ if(inList){html+='</ul>';inList=false;} html+='<hr>'; continue; }

      // 引用块
      if(/^> /.test(line)){
        if(inList){ html+='</ul>'; inList=false; }
        // 收集连续的 > 行
        let quoteLines = [];
        let j = i;
        while(j < lines.length && /^> /.test(lines[j].trimEnd())){
          quoteLines.push(lines[j].trimEnd().replace(/^> /,''));
          j++;
        }
        i = j - 1; // 跳过已处理的行
        const quoteHtml = quoteLines.map(l=>'<p>'+inline(l)+'</p>').join('');
        html += '<blockquote>'+quoteHtml+'</blockquote>';
        continue;
      }

      // 无序列表
      if(/^[\-\*] /.test(line)){
        if(!inList){ html+='<ul>'; inList=true; }
        html+='<li>'+inline(line.replace(/^[\-\*] /,''))+'</li>';
        continue;
      }

      // 单行裸媒体 URL → 媒体块（视频文件 / B 站链接，不走 inline 避免被转义成纯文本）
      const bareMedia = line.trim().match(/^(https?:\/\/\S+)$/i);
      if(bareMedia && (isVideo(bareMedia[1]) || isBilibili(bareMedia[1]))){
        if(inList){ html+='</ul>'; inList=false; }
        html += mediaTag(bareMedia[1], '');
        continue;
      }

      // 普通段落
      if(inList){ html+='</ul>'; inList=false; }
      html+='<p>'+inline(line)+'</p>';
    }
    if(inList) html+='</ul>';
    if(inTable) html+=renderTable(tableRows);
    if(inCode) html+='<pre><code>'+esc(codeBuf)+'</code></pre>';
    return html;
  }

  function inline(text){
    let s = esc(text);
    // 粗体+斜体
    s = s.replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>');
    // 粗体
    s = s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
    // 斜体
    s = s.replace(/\*(.+?)\*/g,'<em>$1</em>');
    // 行内代码
    s = s.replace(/`(.+?)`/g,'<code>$1</code>');
    // 图片/视频/B站（必须放在链接前面）
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,(m,alt,url)=> mediaTag(url, alt));
    // 链接
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(m,txt,url)=>`<a href="${safeUrl(url)}" target="_blank" rel="noopener">${txt}</a>`);
    return s;
  }

  /* URL 协议白名单：无 scheme 的相对路径/锚点一律放行（站内链接如 post.html?id=3）；
   * 带 scheme 的只放行 http(s)、mailto，data: 仅放行 data:image/（AI 配图的 base64）。
   * javascript: / vbscript: 等危险协议一律替换为 '#'，防存储型 XSS。 */
  function safeUrl(u){
    const s = String(u || '').trim();
    const m = s.match(/^([a-z][a-z0-9+.\-]*):/i);
    if (!m) return s;
    const scheme = m[1].toLowerCase();
    if (scheme === 'https' || scheme === 'http' || scheme === 'mailto') return s;
    if (scheme === 'data') return /^data:image\//i.test(s) ? s : '#';
    return '#';
  }

  function renderTable(rows){
    // rows: ['| H1 | H2 |', '| --- | --- |', '| C1 | C2 |', ...]
    if(rows.length<2) return '';
    const divider = rows[1];
    const aligns = divider.split('|').filter(Boolean).map(c=>{
      const t=c.trim();
      if(/^:?-+:?$/.test(t)){
        if(t.startsWith(':')&&t.endsWith(':')) return 'center';
        if(t.endsWith(':')) return 'right';
        return 'left';
      }
      return '';
    });
    function parseRow(r){
      return r.split('|').filter((_,i,a)=>i>0&&i<a.length-1).map((c,i)=>{
        const val = inline(c.trim());
        const a = aligns[i]||'';
        return a ? '<td style="text-align:'+a+'">'+val+'</td>' : '<td>'+val+'</td>';
      }).join('');
    }
    let html = '<table>';
    // header
    const hdr = rows[0];
    html += '<thead><tr>'+hdr.split('|').filter((_,i,a)=>i>0&&i<a.length-1).map((c,i)=>{
      const val = inline(c.trim());
      const a = aligns[i]||'';
      return a ? '<th style="text-align:'+a+'">'+val+'</th>' : '<th>'+val+'</th>';
    }).join('')+'</tr></thead>';
    // body
    html += '<tbody>';
    for(let i=2; i<rows.length; i++){
      html += '<tr>'+parseRow(rows[i])+'</tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  return { render, esc };
})();