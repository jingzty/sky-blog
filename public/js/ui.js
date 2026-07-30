/* 共用交互：toast / 确认框 / 轮播。多页面复用，切换数据源时不碰本文件。 */
window.UI = (function(){

  function toast(msg, ms=2200){
    let el = document.getElementById('appToast');
    if(!el){
      el = document.createElement('div');
      el.id = 'appToast';
      el.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);'
        +'background:var(--night-3);color:var(--night-ink);padding:10px 22px;border-radius:100px;'
        +'font-size:14px;z-index:9999;opacity:0;transition:opacity .25s;pointer-events:none;'
        +'box-shadow:0 8px 30px rgba(0,0,0,0.3);font-family:var(--sans);';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = 1;
    clearTimeout(el._t);
    el._t = setTimeout(()=> el.style.opacity = 0, ms);
  }

  function confirm(msg){
    return new Promise(resolve=>{
      if(!window.confirm(msg)){ resolve(false); return; }
      resolve(true);
    });
  }

  function initCarousel(sel='.slide'){
    const slides=[...document.querySelectorAll(sel)];
    if(!slides.length) return;
    let i=0;
    const show=n=>slides.forEach((s,k)=>s.style.display=(k===n?'block':'none'));
    show(0);
    return { next(){ i=(i+1)%slides.length; show(i); }, prev(){ i=(i-1+slides.length)%slides.length; show(i); } };
  }

  /* 格式化日期 */
  function fmtDate(d){ if(!d) return ''; return d.replace(/-/g,' · '); }
  function fmtMonth(d){ if(!d) return ''; const parts=d.split('-'); return parts[0]+' 年 '+parseInt(parts[1])+' 月'; }

  return { toast, confirm, initCarousel, fmtDate, fmtMonth };
})();