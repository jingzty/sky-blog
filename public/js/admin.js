/*
 * 后台共享脚本：侧栏注入、lucide 图标、退出登录、toast、共用工具函数。
 * 依赖：lucide.js、api.js、ui.js（页面已引入）。
 */
(function () {
  const NAV = [
    { key: 'dashboard',  href: 'index.html',       icon: 'layout-dashboard', label: '仪表盘' },
    { key: 'articles',   href: 'posts.html',       icon: 'file-text',        label: '文章管理' },
    { key: 'categories', href: 'categories.html',  icon: 'folder-open',      label: '分类管理' },
    { key: 'carousel',   href: 'slides.html',      icon: 'image',            label: '轮播管理' },
    { key: 'ai',          href: 'ai.html',          icon: 'sparkles',         label: 'AI 配置' },
    { key: 'images',      href: 'images.html',      icon: 'image-play',       label: '图片库' },
    { key: 'oss',          href: 'oss.html',          icon: 'cloud-upload',     label: 'OSS 配置' },
    { key: 'security',   href: 'security.html',    icon: 'shield',           label: '安全策略' },
    { key: 'settings',   href: 'config.html',      icon: 'settings',         label: '站点配置' },
  ];

  function sidebarHTML() {
    const page = document.body.dataset.page || '';
    const items = NAV.map(n => `
      <a href="${n.href}" data-nav-key="${n.key}" ${n.key === page ? 'data-active="true"' : ''}
         class="sidebar-item flex items-center gap-3 px-4 py-3 rounded-lg text-sm" style="color: var(--warm-ink-2);">
        <i data-lucide="${n.icon}" class="w-[18px] h-[18px]"></i>
        <span>${n.label}</span>
      </a>`).join('');
    return `
      <aside class="admin-sidebar fixed left-0 top-0 h-full w-[240px] flex flex-col" style="background: var(--warm-surface-3);">
        <div class="sb-brand px-6 py-6">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: var(--warm-brand);">
              <i data-lucide="cloud" class="w-5 h-5 text-white"></i>
            </div>
            <span class="text-lg font-semibold" style="color: var(--warm-ink);">后台管理</span>
          </div>
        </div>
        <nav class="sb-nav flex-1 px-4 space-y-1">${items}</nav>
        <div class="sb-foot px-4 py-4 space-y-1">
          <a href="../index.html" class="sidebar-item flex items-center gap-3 px-4 py-3 rounded-lg text-sm" style="color: var(--warm-ink-2);">
            <i data-lucide="external-link" class="w-[18px] h-[18px]"></i><span>查看站点</span>
          </a>
          <a href="#" id="logoutBtn" class="sidebar-item flex items-center gap-3 px-4 py-3 rounded-lg text-sm" style="color: var(--warm-ink-2);">
            <i data-lucide="log-out" class="w-[18px] h-[18px]"></i><span>退出登录</span>
          </a>
        </div>
      </aside>`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const slot = document.getElementById('sidebar-slot');
    if (slot) slot.innerHTML = sidebarHTML();
    else document.body.insertAdjacentHTML('afterbegin', sidebarHTML());

    const lo = document.getElementById('logoutBtn');
    if (lo) lo.addEventListener('click', async e => {
      e.preventDefault();
      try { await API.logout(); } catch (_) { /* 忽略：本地 token 仍要清 */ }
      if (window.API) API.clearToken();
      window.location.href = '../login.html';
    });

    if (window.lucide && lucide.createIcons) lucide.createIcons();
  });

  /* ---- 客户端登录守卫（服务端守卫的二次保险）----
   * 服务端已用 cookie 拦住未登录的页面请求；这里再校验一次 token 有效性，
   * 覆盖 cookie 仍有效但 token 集合已失效（服务重启/token 过期）等边界情况，
   * 避免页面空转半天到点击修改才报错。登录页本身不引此脚本，不会误跳。
   */
  (async function guard() {
    if (!window.API || !API.isAuthed) return;
    // 登录页不引 admin.js，但保险起见：当前在 login 上下文则不拦
    if (location.pathname.endsWith('/login.html')) return;
    if (!API.isAuthed()) {
      window.location.href = '../login.html';
      return;
    }
    try {
      await API.check();
    } catch (_) {
      API.clearToken();
      window.location.href = '../login.html';
    }
  })();

  /* ---- 共用工具：供各后台页面直接使用 ---- */
  const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 后台页面在子目录，相对图片地址需加 ../
  const imgUrl = c => {
    if (!c) return '';
    if (/^https?:\/\//.test(c) || c.startsWith('data:')) return c;
    return '../' + c.replace(/^\//, '');
  };
  const coverUrl = imgUrl;

  // toast 统一走 UI.toast，保留 Admin.toast 别名兼容旧页面脚本
  window.Admin = { toast: (m) => window.UI && UI.toast ? UI.toast(m) : console.warn(m), esc, imgUrl, coverUrl };
})();
