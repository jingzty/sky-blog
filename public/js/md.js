/* 极简 Markdown 渲染：post / editor 共用。支持标题、列表、粗体、斜体、链接、代码块、图片。 */
window.MD = (function(){
  const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

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
    // 图片（必须放在链接前面）
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,(m,alt,url)=>`<img src="${safeUrl(url)}" alt="${alt}" loading="lazy">`);
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