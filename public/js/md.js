/* 极简 Markdown 渲染：post / editor 共用。支持标题、列表、粗体、斜体、链接、代码块、图片。 */
window.MD = (function(){
  const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  function render(src){
    let html = '';
    const lines = String(src||'').split('\n');
    let inList = false, inCode = false, codeBuf = '', codeLang = '';

    for(let i=0; i<lines.length; i++){
      const raw = lines[i];
      const line = raw.trimEnd();

      // 代码块
      if(/^```/.test(line)){
        if(inCode){
          html += '<pre><code'+(codeLang?' class="lang-'+esc(codeLang)+'"':'')+'>'+esc(codeBuf.replace(/\n$/,''))+'</code></pre>';
          codeBuf = ''; codeLang = ''; inCode = false;
        } else {
          inCode = true;
          codeLang = line.replace(/^```/,'').trim();
        }
        continue;
      }
      if(inCode){ codeBuf += raw+'\n'; continue; }

      // 空行
      if(!line){ if(inList){ html+='</ul>'; inList=false; } continue; }

      // 标题
      if(/^#### /.test(line)){ if(inList){html+='</ul>';inList=false;} html+='<h4>'+inline(line.slice(5))+'</h4>'; continue; }
      if(/^### /.test(line)){ if(inList){html+='</ul>';inList=false;} html+='<h3>'+inline(line.slice(4))+'</h3>'; continue; }
      if(/^## /.test(line)){ if(inList){html+='</ul>';inList=false;} html+='<h2>'+inline(line.slice(3))+'</h2>'; continue; }
      if(/^# /.test(line)){ if(inList){html+='</ul>';inList=false;} html+='<h1>'+inline(line.slice(2))+'</h1>'; continue; }

      // 水平线
      if(/^(---|\*\*\*|___)$/.test(line)){ if(inList){html+='</ul>';inList=false;} html+='<hr>'; continue; }

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
    // 链接
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
    // 图片
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,'<img src="$2" alt="$1" loading="lazy">');
    return s;
  }

  return { render, esc };
})();