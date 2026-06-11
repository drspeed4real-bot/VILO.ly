// ===== SUPABASE INIT =====
const { createClient } = supabase;
const sb = createClient(
  'https://odceujftrdympevtgknl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kY2V1amZ0cmR5bXBldnRna25sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTU0MTgsImV4cCI6MjA5NjE3MTQxOH0.cha9-spThAN6ZIgqDii_58suKnyHa-QInbO3wB4trJI'
);

// ===== STATE =====
let currentUser = null;
let currentProfile = null;
let currentGame = null;
let seoEnabled = true;
let likedGames = new Set();
let uploadedThumbUrl = null;  // blob URL for thumbnail
// pendingUpload holds all files ready to be uploaded to Supabase Storage
// { files: [{path, blob, mime}], indexPath: 'index.html' }
let pendingUpload = null;
let currentCategory = '';

// ===== INIT =====
window.addEventListener('DOMContentLoaded', async () => {
  await checkSession();
  if (typeof loadGames === 'function') await loadGames();
  initSearchEnter();
  // Check if redirected from profile page with upload intent
  if (localStorage.getItem('openUpload') === '1') {
    localStorage.removeItem('openUpload');
    requireAuth(() => showSection('upload'));
  }
});

// ===== SESSION =====
async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    await loadProfile();
    updateSidebarUser();
    await loadLikedGames();
  }
}

// ===== AUTH =====
async function register() {
  const username = document.getElementById('regUsername').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;

  if (!username || !email || !password) return showMsg('registerMsg','يرجى ملء جميع الحقول','error');
  if (password.length < 6) return showMsg('registerMsg','كلمة المرور 6 أحرف على الأقل','error');

  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) return showMsg('registerMsg', error.message, 'error');

  currentUser = data.user;
  await sb.from('profiles').upsert({ id: currentUser.id, username, email, created_at: new Date().toISOString() });
  await loadProfile();
  updateSidebarUser();
  closeModal('registerModal');
  showToast(`مرحباً ${username}! 🎮`);
}

async function login() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) return showMsg('loginMsg','يرجى إدخال البيانات','error');

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return showMsg('loginMsg','بيانات غير صحيحة','error');

  currentUser = data.user;
  await loadProfile();
  updateSidebarUser();
  closeModal('loginModal');
  showToast(`أهلاً بعودتك ${currentProfile?.username || ''} 👋`);
  await loadLikedGames();
}

async function logout() {
  await sb.auth.signOut();
  currentUser = null; currentProfile = null;
  likedGames.clear();
  updateSidebarUser();
  showSection('browse');
  showToast('تم تسجيل الخروج');
}

function requireAuth(cb) {
  if (!currentUser) { showModal('loginModal'); return; }
  cb();
}

// ===== PROFILE =====
async function loadProfile() {
  if (!currentUser) return;
  const { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  if (data) { currentProfile = data; populateProfileForm(); }
}

function populateProfileForm() {
  if (!currentProfile) return;
  setVal('profileUsername', currentProfile.username || '');
  setVal('profileEmail', currentUser?.email || '');
  setVal('profilePhone', currentProfile.phone || '');
  setVal('profileBio', currentProfile.bio || '');

  const av = document.getElementById('profileAvatar');
  if (av) {
    if (currentProfile.avatar_url) {
      av.innerHTML = `<img src="${currentProfile.avatar_url}" alt="avatar"/>`;
    } else {
      av.textContent = (currentProfile.username || 'U')[0].toUpperCase();
    }
  }
}

async function saveProfile() {
  if (!currentUser) return;
  const updates = {
    id: currentUser.id,
    username: getVal('profileUsername'),
    phone:    getVal('profilePhone'),
    bio:      getVal('profileBio'),
    updated_at: new Date().toISOString()
  };
  const { error } = await sb.from('profiles').upsert(updates);
  if (error) return showMsg('profileMsg','خطأ: ' + error.message,'error');
  currentProfile = { ...currentProfile, ...updates };
  updateSidebarUser();
  showMsg('profileMsg','تم حفظ الملف الشخصي ✓','success');
  showToast('تم الحفظ بنجاح ✓');
  // Update display name/bio if on profile page
  const dn = document.getElementById('profileDisplayName');
  const db = document.getElementById('profileDisplayBio');
  if (dn) dn.textContent = updates.username;
  if (db) db.textContent = updates.bio || 'لا توجد نبذة بعد';
}

async function uploadAvatar(event) {
  const file = event.target.files[0];
  if (!file || !currentUser) return;
  const ext  = file.name.split('.').pop();
  const path = `${currentUser.id}/avatar.${ext}`;
  const { error } = await sb.storage.from('avatars').upload(path, file, { upsert: true });
  if (error) return showToast('خطأ في رفع الصورة');
  const { data: urlData } = sb.storage.from('avatars').getPublicUrl(path);
  const url = urlData.publicUrl;
  await sb.from('profiles').update({ avatar_url: url }).eq('id', currentUser.id);
  currentProfile = { ...currentProfile, avatar_url: url };
  const av = document.getElementById('profileAvatar');
  if (av) av.innerHTML = `<img src="${url}" alt="avatar"/>`;
  updateSidebarUser();
  showToast('تم تحديث الصورة ✓');
}

function updateSidebarUser() {
  const authDiv = document.getElementById('sidebarAuth');
  const userDiv = document.getElementById('sidebarUser');
  if (!authDiv || !userDiv) return;
  if (!currentUser) {
    authDiv.classList.remove('hidden');
    userDiv.classList.add('hidden');
    return;
  }
  authDiv.classList.add('hidden');
  userDiv.classList.remove('hidden');
  const uname = document.getElementById('sidebarUsername');
  if (uname) uname.textContent = currentProfile?.username || currentUser.email.split('@')[0];
  const sav = document.getElementById('sidebarAvatar');
  if (sav) {
    if (currentProfile?.avatar_url) {
      sav.innerHTML = `<img src="${currentProfile.avatar_url}" alt=""/>`;
    } else {
      sav.textContent = (currentProfile?.username || 'U')[0].toUpperCase();
    }
  }
}

function goToProfile() {
  if (!currentUser) { showModal('loginModal'); return; }
  window.location.href = 'profile.html';
}

// ===== GAMES LOADING =====
async function loadGames() {
  const grid = document.getElementById('gamesGrid');
  if (!grid) return;
  grid.innerHTML = `<div class="loader-state"><div class="loader-spinner"></div><span>جاري التحميل...</span></div>`;

  const engine = document.getElementById('filterEngine')?.value || '';
  const sort   = document.getElementById('filterSort')?.value || 'created_at';

  let q = sb.from('games').select('*')
            .order(sort === 'likes' ? 'likes_count' : 'created_at', { ascending: false });

  if (engine) q = q.eq('engine', engine);
  if (currentCategory) q = q.eq('category', currentCategory);

  const { data, error } = await q.limit(60);
  if (error) {
    console.error('loadGames error:', error);
    grid.innerHTML = `<div class="loader-state" style="flex-direction:column;gap:8px">
      <span>❌ خطأ في التحميل</span>
      <small style="opacity:.7;font-size:.75rem">${error.message}</small>
    </div>`;
    return;
  }

  // جلب أسماء الرافعين دفعة واحدة
  if (data && data.length > 0) {
    const uploaderIds = [...new Set(data.map(g => g.uploader_id).filter(Boolean))];
    const { data: profData } = await sb.from('profiles').select('id, username, avatar_url').in('id', uploaderIds);
    const profMap = {};
    (profData || []).forEach(p => { profMap[p.id] = p; });
    data.forEach(g => { g.profiles = profMap[g.uploader_id] || null; });
  }

  const count = document.getElementById('gameCount');
  if (count) count.textContent = `${data?.length || 0} لعبة`;

  if (!data || data.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🎮</div><p>لا توجد ألعاب بعد. كن أول من يرفع!</p></div>`;
    return;
  }
  grid.innerHTML = data.map(g => gameCardHTML(g)).join('');
}

async function loadLikedGames() {
  if (!currentUser) return;
  const { data } = await sb.from('game_likes').select('game_id').eq('user_id', currentUser.id);
  if (data) likedGames = new Set(data.map(r => r.game_id));
}

function filterByCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  const title = document.getElementById('browseTitle');
  if (title) title.textContent = cat ? `ألعاب: ${btn.textContent}` : 'الألعاب المتاحة';
  loadGames();
}

// ===== GAME CARD HTML =====
function gameCardHTML(g, showDelete = false) {
  const tags  = (g.tags || []).slice(0,3).map(t => `<span class="tag">${escHtml(t)}</span>`).join('');
  const thumb = g.thumbnail_url
    ? `<img class="game-thumbnail" src="${g.thumbnail_url}" alt="${escHtml(g.title)}" loading="lazy"/>`
    : `<div class="game-thumb-placeholder">${engineEmoji(g.engine)}</div>`;
  const seoBadge = g.seo_enabled ? `<span class="seo-badge">SEO</span>` : '';
  const del  = showDelete ? `<button onclick="deleteGame(event,'${g.id}')" style="color:var(--red);background:none;border:none;cursor:pointer;font-size:0.75rem;">🗑</button>` : '';
  return `
  <div class="game-card" onclick="openGame('${g.id}')">
    <div style="position:relative">
      ${thumb}
      <div class="thumb-overlay">▶</div>
      <span class="engine-badge">${g.engine || ''}</span>
      ${seoBadge}
    </div>
    <div class="game-card-body">
      <div class="game-card-title">${escHtml(g.title)}</div>
      <div class="game-card-desc">${escHtml(g.description || '')}</div>
      <div class="card-tags">${tags}</div>
      <div class="game-card-footer">
        <span class="game-card-likes">❤ ${g.likes_count || 0}</span>
        ${del}
      </div>
    </div>
  </div>`;
}

// ===== UPLOAD: DRAG & DROP & FILE =====
let processedGameUrl = null;

function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.add('drag-over');
}
function handleDragLeave(e) {
  document.getElementById('dropzone').classList.remove('drag-over');
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.remove('drag-over');
  const items = e.dataTransfer.items;
  // Check if folder was dropped
  if (items && items.length > 0) {
    const entry = items[0].webkitGetAsEntry ? items[0].webkitGetAsEntry() : null;
    if (entry && entry.isDirectory) {
      readFolderEntry(entry);
      return;
    }
  }
  const files = e.dataTransfer.files;
  if (files.length > 0) processFiles(files);
}

function handleFileSelect(e) {
  const files = e.target.files;
  if (files.length > 0) {
    // Check if multiple files (folder select)
    if (files.length > 1) {
      processFolderFiles(Array.from(files));
    } else {
      processFiles(files);
    }
  }
}

// ===== MIME HELPER =====
function guessMime(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    html:'text/html', htm:'text/html',
    js:'application/javascript', mjs:'application/javascript',
    css:'text/css',
    png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
    gif:'image/gif', webp:'image/webp', svg:'image/svg+xml',
    ico:'image/x-icon', bmp:'image/bmp',
    wasm:'application/wasm',
    json:'application/json', xml:'application/xml',
    mp3:'audio/mpeg', ogg:'audio/ogg', wav:'audio/wav',
    mp4:'video/mp4', webm:'video/webm',
    ttf:'font/ttf', woff:'font/woff', woff2:'font/woff2',
    data:'application/octet-stream', mem:'application/octet-stream',
    unity3d:'application/octet-stream', unityweb:'application/octet-stream',
    pck:'application/octet-stream',
  };
  return map[ext] || 'application/octet-stream';
}

// ===== FILE PROCESSING — stores files in pendingUpload for later Supabase upload =====

async function processFiles(files) {
  const file = files[0];
  const name = file.name.toLowerCase();

  if (name.endsWith('.zip')) {
    setStatus('loading', '📦 جاري فك ضغط الأرشيف...');
    await extractZip(file);
  } else if (name.endsWith('.html') || name.endsWith('.htm')) {
    // Read as UTF-8 text, inject charset meta if missing, re-encode as UTF-8 blob
    const text = await readFileAsUTF8(file);
    const fixedHtml = ensureUtf8Meta(text);
    const blob = new Blob([fixedHtml], { type: 'text/html; charset=utf-8' });
    pendingUpload = { files: [{ path: 'index.html', blob, mime: 'text/html; charset=utf-8' }], indexPath: 'index.html' };
    processedGameUrl = 'pending';
    setStatus('success', `✓ ملف HTML جاهز للرفع: ${file.name}`);
    const titleEl = document.getElementById('gameTitle');
    if (titleEl && !titleEl.value) titleEl.value = file.name.replace(/\.html?$/i, '');
  } else {
    setStatus('error', '⚠ صيغة غير مدعومة. استخدم: .html أو .zip أو مجلد');
  }
}

// ===== UTF-8 HELPERS =====
function readFileAsUTF8(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('فشل قراءة الملف'));
    reader.readAsText(file, 'UTF-8');
  });
}

function ensureUtf8Meta(html) {
  // If <meta charset> already exists, make sure it says UTF-8
  if (/<meta[^>]+charset/i.test(html)) {
    return html.replace(/<meta[^>]+charset=[^"'>]*["']?/i, '<meta charset="UTF-8"');
  }
  // Inject <meta charset> right after <head> or at very start
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/(<head[^>]*>)/i, '$1\n  <meta charset="UTF-8"/>');
  }
  // No <head> tag — inject before anything else
  return '<meta charset="UTF-8"/>\n' + html;
}

async function extractZip(file) {
  try {
    const JSZip = window.JSZip;
    if (!JSZip) { setStatus('error', '⚠ مكتبة JSZip غير محملة'); return; }

    const zip = await JSZip.loadAsync(file);
    const fileNames = Object.keys(zip.files).filter(n => !zip.files[n].dir);

    // Find index.html — root first, then any subfolder
    let indexPath = null;
    if (zip.files['index.html']) indexPath = 'index.html';
    else if (zip.files['index.htm']) indexPath = 'index.htm';
    else {
      for (const n of fileNames) {
        if (n.endsWith('/index.html') || n.endsWith('/index.htm')) { indexPath = n; break; }
      }
    }
    if (!indexPath) { setStatus('error', '⚠ لم يتم العثور على index.html داخل الأرشيف'); return; }

    // Detect base dir (e.g. "mygame/") to strip it from paths
    const baseDir = indexPath.includes('/') ? indexPath.substring(0, indexPath.lastIndexOf('/') + 1) : '';

    // Extract all files into pendingUpload
    const uploadFiles = [];
    let loaded = 0;
    for (const name of fileNames) {
      const arrayBuf = await zip.files[name].async('arraybuffer');
      let mime = guessMime(name);
      // Strip baseDir prefix so paths are relative to root
      const storagePath = baseDir && name.startsWith(baseDir) ? name.slice(baseDir.length) : name;
      if (!storagePath) continue; // skip the root folder entry itself

      let blob;
      // Fix UTF-8 encoding for HTML files
      if (name.endsWith('.html') || name.endsWith('.htm')) {
        const text = new TextDecoder('utf-8').decode(arrayBuf);
        const fixedHtml = ensureUtf8Meta(text);
        mime = 'text/html; charset=utf-8';
        blob = new Blob([fixedHtml], { type: mime });
      } else {
        blob = new Blob([arrayBuf], { type: mime });
      }

      uploadFiles.push({ path: storagePath, blob, mime });
      loaded++;
      setStatus('loading', `📦 جاري قراءة الملفات... ${loaded}/${fileNames.length}`);
    }

    const newIndexPath = baseDir ? indexPath.slice(baseDir.length) : indexPath;
    pendingUpload = { files: uploadFiles, indexPath: newIndexPath };
    processedGameUrl = 'pending';

    setStatus('success', `✓ جاهز للرفع: ${uploadFiles.length} ملف — نقطة البداية: ${newIndexPath}`);
    const titleEl = document.getElementById('gameTitle');
    if (titleEl && !titleEl.value) titleEl.value = file.name.replace(/\.zip$/i, '');

  } catch (err) {
    setStatus('error', '⚠ خطأ في فك الضغط: ' + err.message);
  }
}

async function processFolderFiles(files) {
  // files = File[] from folder select or drag-drop, with webkitRelativePath
  setStatus('loading', `📁 جاري قراءة المجلد (${files.length} ملف)...`);

  // Find index.html — prefer root-level, then any sub-path
  let indexFile = null;
  let indexRelPath = null;
  for (const f of files) {
    const rel = f.webkitRelativePath || f.name;
    const parts = rel.split('/');
    // root-level = parts.length === 2 (folder/file)
    if ((f.name === 'index.html' || f.name === 'index.htm') && parts.length === 2) {
      indexFile = f; indexRelPath = rel; break;
    }
  }
  // fallback: any index.html anywhere
  if (!indexFile) {
    for (const f of files) {
      if (f.name === 'index.html' || f.name === 'index.htm') {
        indexFile = f; indexRelPath = f.webkitRelativePath || f.name; break;
      }
    }
  }
  if (!indexFile) { setStatus('error', '⚠ لم يتم العثور على index.html في المجلد'); return; }

  // BaseDir = top-level folder name + '/'  e.g. "mygame/"
  const topFolder = (indexRelPath.includes('/') ? indexRelPath.split('/')[0] : '') + '/';
  const uploadFiles = [];
  let loaded = 0;
  for (const f of files) {
    const rel = f.webkitRelativePath || f.name;
    // Strip top-level folder to get storage path
    const storagePath = rel.startsWith(topFolder) ? rel.slice(topFolder.length) : rel;
    if (!storagePath) continue;
    const arrayBuf = await f.arrayBuffer();
    let mime = guessMime(f.name);
    let blob;
    // Fix UTF-8 encoding for HTML files
    if (f.name.endsWith('.html') || f.name.endsWith('.htm')) {
      const text = new TextDecoder('utf-8').decode(arrayBuf);
      const fixedHtml = ensureUtf8Meta(text);
      mime = 'text/html; charset=utf-8';
      blob = new Blob([fixedHtml], { type: mime });
    } else {
      blob = new Blob([arrayBuf], { type: mime });
    }
    uploadFiles.push({ path: storagePath, blob, mime });
    loaded++;
    if (loaded % 10 === 0) setStatus('loading', `📁 جاري القراءة... ${loaded}/${files.length}`);
  }

  const newIndexPath = (indexRelPath.startsWith(topFolder) ? indexRelPath.slice(topFolder.length) : indexRelPath);
  pendingUpload = { files: uploadFiles, indexPath: newIndexPath };
  processedGameUrl = 'pending';

  setStatus('success', `✓ المجلد جاهز للرفع: ${uploadFiles.length} ملف — نقطة البداية: ${newIndexPath}`);
  const titleEl = document.getElementById('gameTitle');
  if (titleEl && !titleEl.value) titleEl.value = topFolder.replace(/\/$/, '') || 'لعبتي';
}

async function readFolderEntry(dirEntry) {
  const allFiles = [];
  await collectEntries(dirEntry, '', allFiles);
  if (allFiles.length === 0) { setStatus('error', '⚠ المجلد فارغ'); return; }
  await processFolderFiles(allFiles);
}

function collectEntries(entry, pathPrefix, result) {
  return new Promise(resolve => {
    if (entry.isFile) {
      entry.file(f => {
        // Attach relative path manually since dropped entries lose webkitRelativePath
        Object.defineProperty(f, 'webkitRelativePath', { value: pathPrefix + f.name });
        result.push(f);
        resolve();
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      // readEntries may return in chunks — keep reading until empty
      const readAll = (cb) => {
        reader.readEntries(async entries => {
          if (entries.length === 0) { cb(); return; }
          for (const e of entries) await collectEntries(e, pathPrefix + entry.name + '/', result);
          readAll(cb);
        });
      };
      readAll(resolve);
    } else resolve();
  });
}

function setStatus(type, msg) {
  const s = document.getElementById('fileStatus');
  if (!s) return;
  s.textContent = msg;
  s.className = `file-status ${type}`;
  s.classList.remove('hidden');
}

// ===== UPLOAD MODE SWITCH =====
function switchUploadMode(mode, btn) {
  document.querySelectorAll('.umode-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('uploadModeFile').classList.toggle('hidden', mode !== 'file');
  document.getElementById('uploadModeUrl').classList.toggle('hidden', mode !== 'url');
  if (mode === 'url') { pendingUpload = null; processedGameUrl = null; }
}

// ===== THUMBNAIL =====
function handleThumbFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  uploadedThumbUrl = url;
  previewThumbnailUrl(url);
  // Clear URL input
  const urlInput = document.getElementById('gameThumbnail');
  if (urlInput) urlInput.value = '';
}

function previewThumbnailUrl(url) {
  if (!url) return;
  const prev = document.getElementById('thumbPreview');
  if (!prev) return;
  prev.innerHTML = `<img src="${url}" alt="thumb"/>`;
  uploadedThumbUrl = url;
}

// ===== UPLOAD GAME =====
async function uploadGame() {
  if (!currentUser) return showModal('loginModal');

  const title       = getVal('gameTitle').trim();
  const description = getVal('gameDesc').trim();
  const engine      = getVal('gameEngine');
  const category    = getVal('gameCategory');
  const rawTags     = getVal('gameTags').trim();

  const urlMode = document.querySelector('.umode-tab.active')?.dataset.mode === 'url';
  let gameUrl   = urlMode ? getVal('gameUrl').trim() : null;

  let thumbnailUrl = getVal('gameThumbnail').trim() || null;

  if (!title || !description) return showMsg('uploadMsg','يرجى ملء الحقول المطلوبة *','error');
  if (!urlMode && !pendingUpload) return showMsg('uploadMsg','يرجى رفع ملف أو مجلد اللعبة أولاً','error');
  if (urlMode && !gameUrl) return showMsg('uploadMsg','يرجى إدخال رابط اللعبة','error');

  const tags = rawTags ? rawTags.split(',').map(t => t.trim()).filter(Boolean) : [];
  const slug = slugify(title);
  const uid  = currentUser.id;
  const ts   = Date.now();
  const gameFolder = `${uid}/${ts}`;

  const btn = document.querySelector('#section-upload .btn-primary.full-w');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الرفع...'; }

  try {

    // ── 1. رفع ملفات اللعبة ──
    if (!urlMode && pendingUpload) {
      const total = pendingUpload.files.length;
      const isSingleHtml = total === 1 && (
        pendingUpload.indexPath === 'index.html' || pendingUpload.indexPath === 'index.htm'
      );

      if (isSingleHtml) {
        // ملف HTML منفرد: نحوّله إلى data URL مباشرةً — لا حاجة لـ Storage
        showMsg('uploadMsg', '⚙️ جاري معالجة الملف...', 'success');
        const htmlText = await pendingUpload.files[0].blob.text();
        // data URL يعمل مباشرة في iframe بدون قيود CORS أو Content-Type
        gameUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlText);
      } else {
        // مجلد أو ZIP متعدد الملفات: ارفع إلى Storage كالمعتاد
        let done = 0;
        for (const f of pendingUpload.files) {
          const storagePath = `${gameFolder}/${f.path}`;
          const { error: upErr } = await sb.storage.from('games').upload(
            storagePath, f.blob,
            { contentType: f.mime, upsert: true }
          );
          if (upErr) throw new Error(`فشل رفع ${f.path}: ${upErr.message}`);
          done++;
          showMsg('uploadMsg', `⏫ جاري الرفع... ${done}/${total} ملف`, 'success');
          if (btn) btn.textContent = `⏳ ${Math.round(done/total*100)}%`;
        }
        // بناء رابط index.html الدائم
        const { data: urlData } = sb.storage.from('games').getPublicUrl(`${gameFolder}/${pendingUpload.indexPath}`);
        gameUrl = urlData.publicUrl;
      }
    }

    // ── 2. رفع الصورة المصغرة ──
    if (uploadedThumbUrl && uploadedThumbUrl.startsWith('blob:')) {
      showMsg('uploadMsg', '⏫ جاري رفع الصورة المصغرة...', 'success');
      const resp = await fetch(uploadedThumbUrl);
      const blob = await resp.blob();
      const ext  = blob.type.split('/')[1] || 'jpg';
      const path = `${uid}/${ts}.${ext}`;
      const { error: thErr } = await sb.storage.from('thumbnails').upload(path, blob, {
        contentType: blob.type, upsert: true
      });
      if (thErr) throw new Error('فشل رفع الصورة: ' + thErr.message);
      const { data: thUrl } = sb.storage.from('thumbnails').getPublicUrl(path);
      thumbnailUrl = thUrl.publicUrl;
    } else if (uploadedThumbUrl) {
      thumbnailUrl = uploadedThumbUrl;
    }

    // ── 3. حفظ اللعبة في قاعدة البيانات ──
    showMsg('uploadMsg', '💾 جاري الحفظ...', 'success');
    const { data, error } = await sb.from('games').insert({
      title, description, engine, category,
      tags, game_url: gameUrl,
      thumbnail_url: thumbnailUrl,
      uploader_id: uid,
      seo_enabled: seoEnabled,
      slug, likes_count: 0,
      created_at: new Date().toISOString()
    }).select().single();

    if (error) throw new Error(error.message);
    if (seoEnabled && data) await generateSEOMeta(data);

    pendingUpload = null;
    showMsg('uploadMsg', `🎉 تم نشر "${title}" بنجاح!`, 'success');
    clearUploadForm();
    await loadGames();
    showToast('تم نشر اللعبة! 🚀');
    setTimeout(() => showSection('browse'), 1800);

  } catch (err) {
    showMsg('uploadMsg', 'خطأ: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🚀 نشر اللعبة'; }
  }
}

async function generateSEOMeta(game) {
  const metaDesc = (game.description || '').slice(0, 155) + '...';
  await sb.from('games').update({ meta_description: metaDesc, meta_keywords: (game.tags || []).join(', ') }).eq('id', game.id);
}

async function deleteGame(e, id) {
  e.stopPropagation();
  if (!confirm('هل أنت متأكد من حذف هذه اللعبة؟')) return;
  const { error } = await sb.from('games').delete().eq('id', id).eq('uploader_id', currentUser.id);
  if (error) return showToast('خطأ في الحذف');
  showToast('تم حذف اللعبة');
  // Reload relevant grids
  if (document.getElementById('myGamesGrid')) {
    if (typeof loadMyGamesPage === 'function') await loadMyGamesPage();
  }
  await loadGames();
}

// ===== GAME MODAL =====
// ===== LOAD GAME IN FRAME =====
// يجلب HTML ويضعه في srcdoc مباشرة — يحل مشكلة Supabase Content-Type
async function loadGameInFrame(frame, gameUrl) {
  if (!gameUrl) return;

  // data URL من رفع جديد
  if (gameUrl.startsWith('data:text/html')) {
    const html = decodeURIComponent(gameUrl.split(',').slice(1).join(','));
    frame.removeAttribute('src');
    frame.srcdoc = html;
    return;
  }

  // رابط Supabase Storage — نجلبه ونضعه في srcdoc (نفس الأصل، لا CORS)
  if (gameUrl.includes('supabase.co/storage')) {
    try {
      const resp = await fetch(gameUrl);
      if (resp.ok) {
        const html = await resp.text();
        const fixed = ensureUtf8Meta(html);
        frame.removeAttribute('src');
        frame.srcdoc = fixed;
        return;
      }
    } catch(e) {
      console.warn('supabase fetch failed:', e);
    }
  }

  // روابط خارجية أو HTML — نحمّلها مباشرة في iframe.src (بدون fetch لتجنب CORS)
  frame.removeAttribute('srcdoc');
  frame.src = gameUrl;
}

async function openGameBySlug(slug) {
  const { data: g, error } = await sb.from('games').select('*').eq('slug', slug).single();
  if (error || !g) {
    console.error('openGameBySlug error:', error);
    return showToast('تعذر تحميل اللعبة: ' + (error?.message || 'غير معروف'));
  }
  await _renderGameModal(g);
}

async function openGame(id) {
  const { data: g, error } = await sb.from('games').select('*').eq('id', id).single();
  if (error || !g) {
    console.error('openGame error:', error);
    return showToast('تعذر تحميل اللعبة: ' + (error?.message || 'غير معروف'));
  }
  await _renderGameModal(g);
}

async function _renderGameModal(g) {
  // جلب اسم الرافع
  if (g.uploader_id) {
    const { data: prof } = await sb.from('profiles').select('username').eq('id', g.uploader_id).single();
    g.profiles = prof || null;
  }
  currentGame = g;

  // Push SEO-friendly slug URL to browser history
  if (g.slug) {
    const slugUrl = `${window.location.pathname.replace(/\/game\/[^/]+$/, '')}/game/${g.slug}`;
    window.history.pushState({ gameSlug: g.slug }, g.title, slugUrl);
  }

  document.getElementById('gmTitle').textContent    = g.title;
  document.getElementById('gmDesc').textContent     = g.description || '';
  document.getElementById('gmEngine').textContent   = g.engine || '';
  document.getElementById('gmCategory').textContent = g.category || '';
  document.getElementById('likeCount').textContent  = g.likes_count || 0;
  document.getElementById('gmUploader').textContent = g.profiles?.username || 'مجهول';

  const tagsEl = document.getElementById('gmTags');
  tagsEl.innerHTML = (g.tags || []).map(t => `<span class="tag">${escHtml(t)}</span>`).join('');

  // تحميل اللعبة في iframe
  const frame = document.getElementById('gameFrame');
  const gameUrl = g.game_url || '';
  await loadGameInFrame(frame, gameUrl);

  const liked = likedGames.has(g.id);
  document.getElementById('likeIcon').textContent = liked ? '❤️' : '🤍';
  document.getElementById('likeBtn').className = 'action-btn like-btn' + (liked ? ' liked' : '');

  const ec = document.getElementById('embedCode');
  if (ec) ec.value = `<iframe src="${g.game_url}" width="800" height="600" frameborder="0" allowfullscreen title="${g.title}"></iframe>`;

  const eb = document.getElementById('embedBox');
  if (eb) eb.classList.add('hidden');

  showModal('gameModal');

  if (g.seo_enabled) {
    document.title = `${g.title} — GameVault`;
    setMeta('description', g.meta_description || g.description);
    setOg('title', g.title);
    if (g.thumbnail_url) setOg('image', g.thumbnail_url);
  }
}

async function toggleLike() {
  if (!currentUser) return showModal('loginModal');
  const id = currentGame?.id;
  if (!id) return;
  const liked = likedGames.has(id);
  if (liked) {
    await sb.from('game_likes').delete().eq('user_id', currentUser.id).eq('game_id', id);
    likedGames.delete(id);
    currentGame.likes_count = Math.max(0, (currentGame.likes_count || 1) - 1);
    document.getElementById('likeIcon').textContent = '🤍';
    document.getElementById('likeBtn').classList.remove('liked');
  } else {
    await sb.from('game_likes').insert({ user_id: currentUser.id, game_id: id });
    likedGames.add(id);
    currentGame.likes_count = (currentGame.likes_count || 0) + 1;
    document.getElementById('likeIcon').textContent = '❤️';
    document.getElementById('likeBtn').classList.add('liked');
  }
  await sb.from('games').update({ likes_count: currentGame.likes_count }).eq('id', id);
  document.getElementById('likeCount').textContent = currentGame.likes_count;
  await loadGames();
}

function shareGame() {
  const base = window.location.origin + window.location.pathname.replace(/\/game\/[^/]+$/, '');
  const slug = currentGame?.slug;
  const url = slug ? `${base}/game/${slug}` : window.location.href.split('?')[0] + `?game=${currentGame?.id}`;
  if (navigator.share) navigator.share({ title: currentGame?.title, url });
  else { navigator.clipboard.writeText(url); showToast('تم نسخ الرابط 📋'); }
}

// ===== GAME VIEW CONTROLS =====
let isGameFullscreen = false;

function toggleGameView() {
  const modalBox   = document.getElementById('gameModalBox');
  const infoPanel  = document.getElementById('gameInfoPanel');
  const icon       = document.getElementById('viewToggleIcon');
  const label      = document.getElementById('viewToggleLabel');
  if (!modalBox) return;

  isGameFullscreen = !isGameFullscreen;

  if (isGameFullscreen) {
    modalBox.classList.add('game-modal-fullscreen');
    if (infoPanel) infoPanel.classList.add('hidden');
    if (icon)  icon.textContent  = '⊡';
    if (label) label.textContent = 'نافذة مصغرة';
    showToast('وضع الشاشة الكاملة — اضغط مجدداً للخروج');
  } else {
    modalBox.classList.remove('game-modal-fullscreen');
    if (infoPanel) infoPanel.classList.remove('hidden');
    if (icon)  icon.textContent  = '⛶';
    if (label) label.textContent = 'شاشة كاملة';
    showToast('وضع النافذة');
  }
}

// Keep old name as alias for backward compatibility
function toggleGameFullscreen() { toggleGameView(); }

async function openGameNewTab() {
  if (!currentGame?.game_url) return;
  const url = currentGame.game_url;

  // data URL (رفع جديد)
  if (url.startsWith('data:text/html')) {
    const html = decodeURIComponent(url.split(',').slice(1).join(','));
    openHtmlInNewTab(html);
    return;
  }

  // رابط Supabase Storage — نجلب HTML ونفتحه كـ Blob
  if (url.includes('supabase.co/storage') || url.endsWith('.html') || url.endsWith('.htm')) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const html = await resp.text();
        openHtmlInNewTab(ensureUtf8Meta(html));
        return;
      }
    } catch(e) { /* fallback below */ }
  }

  window.open(url, '_blank', 'noopener');
}

function openHtmlInNewTab(html) {
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
}

async function reloadFrame() {
  const frame = document.getElementById('gameFrame');
  if (!frame || !currentGame?.game_url) return;
  frame.srcdoc = '';
  frame.src = '';
  showToast('🔄 جاري إعادة التحميل...');
  setTimeout(() => loadGameInFrame(frame, currentGame.game_url), 200);
}

// Hide black-screen notice after iframe loads successfully
document.addEventListener('DOMContentLoaded', () => {
  const frame = document.getElementById('gameFrame');
  if (frame) {
    frame.addEventListener('load', () => {
      const notice = document.getElementById('gameBlackNotice');
      if (notice && frame.src && frame.src !== window.location.href) {
        setTimeout(() => {
          notice.style.transition = 'opacity 0.4s';
          notice.style.opacity = '0';
          setTimeout(() => { notice.style.display = 'none'; }, 400);
        }, 1500);
      }
    });
  }
});
function showEmbed() { document.getElementById('embedBox')?.classList.toggle('hidden'); }
function copyEmbed() {
  const ta = document.getElementById('embedCode');
  if (ta) { ta.select(); navigator.clipboard.writeText(ta.value); showToast('تم نسخ كود التضمين 📋'); }
}

// ===== SEARCH =====
async function performSearch() {
  const q = document.getElementById('searchInput')?.value.trim();
  if (!q) return loadGames();
  showSection('browse');
  const grid = document.getElementById('gamesGrid');
  if (!grid) return;
  grid.innerHTML = `<div class="loader-state"><div class="loader-spinner"></div><span>جاري البحث...</span></div>`;
  const { data } = await sb.from('games').select('*')
    .or(`title.ilike.%${q}%,description.ilike.%${q}%`).order('created_at', { ascending: false });
  if (!data || data.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>لا نتائج لـ "${escHtml(q)}"</p></div>`;
    return;
  }
  grid.innerHTML = data.map(g => gameCardHTML(g)).join('');
  const count = document.getElementById('gameCount');
  if (count) count.textContent = `${data.length} نتيجة`;
}

function initSearchEnter() {
  document.getElementById('searchInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') performSearch();
  });
}

// ===== SECTIONS =====
function showSection(name, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
  const sec = document.getElementById(`section-${name}`);
  if (sec) sec.classList.add('active');
  if (btn) btn.classList.add('active');
  else {
    const navBtn = document.querySelector(`.nav-item[data-section="${name}"]`);
    if (navBtn) navBtn.classList.add('active');
  }
  const hero = document.getElementById('heroBanner');
  if (hero) hero.style.display = name === 'browse' ? 'flex' : 'none';
  if (name === 'browse') loadGames();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToGames() {
  document.getElementById('section-browse')?.scrollIntoView({ behavior: 'smooth' });
}

// ===== SIDEBAR TOGGLE =====
function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
}

// ===== SEO TOGGLE =====
function toggleSeo() {
  seoEnabled = !seoEnabled;
  const t = document.getElementById('seoToggle');
  if (t) t.dataset.on = seoEnabled.toString();
}

// ===== MODALS =====
function showModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  if (id === 'gameModal') {
    const f = document.getElementById('gameFrame');
    if (f) { f.src = ''; f.srcdoc = ''; }
    document.title = 'GameVault — منصة الألعاب';
    // Restore base URL (remove /game/slug or ?game=id)
    const cleanUrl = window.location.pathname.replace(/\/game\/[^/]+$/, '') || '/';
    window.history.pushState({}, document.title, cleanUrl + window.location.search.replace(/[?&]game=[^&]+/, ''));
    // Reset fullscreen state
    if (isGameFullscreen) {
      const modalBox   = document.getElementById('gameModalBox');
      const infoPanel  = document.getElementById('gameInfoPanel');
      const icon       = document.getElementById('viewToggleIcon');
      const label      = document.getElementById('viewToggleLabel');
      if (modalBox)  modalBox.classList.remove('game-modal-fullscreen');
      if (infoPanel) infoPanel.classList.remove('hidden');
      if (icon)      icon.textContent  = '⛶';
      if (label)     label.textContent = 'شاشة كاملة';
      isGameFullscreen = false;
    }
    // Reset black-screen notice
    const notice = document.getElementById('gameBlackNotice');
    if (notice) { notice.style.opacity = '1'; notice.style.display = ''; }
  }
}
function overlayClose(e, id) {
  if (e.target.classList.contains('modal-overlay')) closeModal(id);
}
function switchModal(from, to) { closeModal(from); setTimeout(() => showModal(to), 100); }

// ===== HELPERS =====
function showMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text; el.className = `msg ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4500);
}
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}
function getVal(id) { return document.getElementById(id)?.value || ''; }
function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function slugify(str) {
  return str.toLowerCase().trim().replace(/\s+/g,'-').replace(/[^\w\-]/g,'').slice(0,60);
}
function engineEmoji(eng) {
  return { html:'🌐', unity:'⬡', godot:'🤖', ue4:'🔷' }[eng] || '🎮';
}
function clearUploadForm() {
  ['gameTitle','gameDesc','gameTags','gameUrl','gameThumbnail'].forEach(id => setVal(id,''));
  processedGameUrl = null; uploadedThumbUrl = null; pendingUpload = null;
  const prev = document.getElementById('thumbPreview');
  if (prev) prev.innerHTML = '<span>🖼</span><p>لا توجد صورة</p>';
  const fs = document.getElementById('fileStatus');
  if (fs) { fs.className = 'file-status hidden'; fs.textContent = ''; }
}
function setMeta(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) { el = document.createElement('meta'); el.name = name; document.head.appendChild(el); }
  el.content = content || '';
}
function setOg(prop, content) {
  let el = document.querySelector(`meta[property="og:${prop}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute('property',`og:${prop}`); document.head.appendChild(el); }
  el.content = content || '';
}

// ===== BROWSER BACK BUTTON =====
window.addEventListener('popstate', (e) => {
  // If we navigated away from a /game/slug URL, close the modal
  const slugMatch = window.location.pathname.match(/\/game\/([^/]+)$/);
  if (!slugMatch) {
    const modal = document.getElementById('gameModal');
    if (modal?.classList.contains('open')) {
      // Close without pushing another history entry
      modal.classList.remove('open');
      const f = document.getElementById('gameFrame');
      if (f) { f.src = ''; f.srcdoc = ''; }
      document.title = 'GameVault — منصة الألعاب';
      if (isGameFullscreen) {
        const modalBox  = document.getElementById('gameModalBox');
        const infoPanel = document.getElementById('gameInfoPanel');
        const icon      = document.getElementById('viewToggleIcon');
        const label     = document.getElementById('viewToggleLabel');
        if (modalBox)  modalBox.classList.remove('game-modal-fullscreen');
        if (infoPanel) infoPanel.classList.remove('hidden');
        if (icon)      icon.textContent  = '⛶';
        if (label)     label.textContent = 'شاشة كاملة';
        isGameFullscreen = false;
      }
    }
  } else if (e.state?.gameSlug) {
    // Navigated to a game slug via back — re-open it
    openGameBySlug(e.state.gameSlug);
  }
});


(async () => {
  await checkSession();

  // Support /game/slug path
  const slugMatch = window.location.pathname.match(/\/game\/([^/]+)$/);
  if (slugMatch) {
    await openGameBySlug(slugMatch[1]);
    return;
  }

  // من الـ Worker redirect: ?openGame=slug
  const params = new URLSearchParams(window.location.search);
  const openSlug = params.get('openGame');
  if (openSlug) {
    window.history.replaceState({}, '', `/game/${openSlug}`);
    await openGameBySlug(openSlug);
    return;
  }

  // Legacy fallback: ?game=id
  const gameId = params.get('game');
  if (gameId) { await openGame(gameId); }
})();
