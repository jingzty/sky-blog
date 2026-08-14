/* 数据层：页面只依赖这里的接口，不关心实现。
 * 重构：移除已废弃的 localStorage 双实现与重复种子数据，仅保留 remote。
 * 方法名 = 契约 C 的业务动作；字段名 = 契约 B。页面里绝不直接写 fetch。
 */
window.API = (function () {
  const TOKEN_KEY = 'app_token';

  const token = () => localStorage.getItem(TOKEN_KEY) || '';
  const setToken = t => localStorage.setItem(TOKEN_KEY, t);
  const clearToken = () => localStorage.removeItem(TOKEN_KEY);
  const isAuthed = () => !!token();

  async function request(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    if (token()) opts.headers['Authorization'] = 'Bearer ' + token();
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || `请求失败 (${res.status})`);
    return data;
  }

  const qs = params => {
    const s = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') s.set(k, v);
    });
    const str = s.toString();
    return str ? '?' + str : '';
  };

  return {
    isAuthed, setToken, clearToken,
    MODE: 'remote',

    /* 认证 */
    login: (u, p) => request('POST', '/api/login', { username: u, password: p }).then(r => { if (r && r.token) setToken(r.token); return r; }),
    check: () => request('GET', '/api/check'),
    logout: () => request('POST', '/api/logout').catch(() => null),
    isAuthedFresh: async () => { try { await request('GET', '/api/check'); return true; } catch (_) { return false; } },

    /* 文章 */
    getPosts: (params = {}) => request('GET', '/api/posts' + qs(params)),
    getPost: id => request('GET', '/api/posts/' + id),
    getNeighbors: id => request('GET', '/api/posts/' + id + '/neighbors'),
    createPost: d => request('POST', '/api/posts', d),
    updatePost: (id, d) => request('PUT', '/api/posts/' + id, d),
    setPostStatus: (id, s) => request('PATCH', '/api/posts/' + id + '/status', { status: s }),
    deletePost: id => request('DELETE', '/api/posts/' + id),

    /* 分类 */
    getCategories: () => request('GET', '/api/categories'),
    createCategory: d => request('POST', '/api/categories', d),
    updateCategory: (id, d) => request('PUT', '/api/categories/' + id, d),
    deleteCategory: id => request('DELETE', '/api/categories/' + id),

    /* 轮播 */
    getSlides: (params = {}) => request('GET', '/api/slides' + qs(params)),
    saveSlides: l => request('PUT', '/api/slides', l),

    /* 配置 */
    getConfig: () => request('GET', '/api/config'),
    updateConfig: d => request('PUT', '/api/config', d),

    /* 登录安全策略 */
    getSecurity: () => request('GET', '/api/security'),
    updateSecurity: d => request('PUT', '/api/security', d),
    unbanIp: ip => request('DELETE', '/api/security/bans/' + encodeURIComponent(ip)),

    /* 访问 IP 统计 */
    getVisits: (limit = 20) => request('GET', '/api/visits?limit=' + limit),
    clearVisits: () => request('DELETE', '/api/visits'),

    /* AI 模型配置 */
    getAiModels: () => request('GET', '/api/ai-models'),
    createAiModel: d => request('POST', '/api/ai-models', d),
    updateAiModel: (id, d) => request('PUT', '/api/ai-models/' + id, d),
    deleteAiModel: id => request('DELETE', '/api/ai-models/' + id),
    testAiModel: id => request('POST', '/api/ai-models/' + id + '/test'),
    testAiModelDraft: d => request('POST', '/api/ai-models/test', d),

    /* AI 写作 */
    getTextModels: () => request('GET', '/api/ai/text-models'),
    aiGenerate: d => request('POST', '/api/ai/generate', d),
    /* AI 配图 */
    getImageModels: () => request('GET', '/api/ai/image-models'),
    aiGenerateImage: d => request('POST', '/api/ai/generate-image', d),

    /* OSS 文件上传 */
    getOssConfig: () => request('GET', '/api/oss-config'),
    updateOssConfig: d => request('PUT', '/api/oss-config', d),
    testOss: () => request('POST', '/api/oss/test'),
    uploadOss: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      return fetch('/api/oss/upload', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + (localStorage.getItem('app_token') || '') },
        body: fd,
      }).then(async r => { const j = await r.json().catch(() => null); if (!r.ok) throw new Error((j && j.error) || `上传失败 (${r.status})`); return j; });
    },


    /* 搜索 */
    search: q => request('GET', '/api/search?q=' + encodeURIComponent(q)),
  };
})();
