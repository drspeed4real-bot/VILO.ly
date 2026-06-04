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
let uploadedGameUrl = null;   // blob URL from file/zip
let uploadedThumbUrl = null;  // blob URL for thumbnail
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

  let q = sb.from('games').select(`*, profiles:uploader_id(username, avatar_url)`)
            .order(sort === 'likes' ? 'likes_count' : 'created_at', { ascending: false });

  if (engine) q = q.eq('engine', engine);
  if (currentCategory) q = q.eq('category', currentCategory);

  const { data, error } = await q.limit(60);
  if (error) { grid.innerHTML = `<div class="loader-state">خطأ في التحميل</div>`; return; }

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

async function processFiles(files) {
  const file = files[0];
  const name = file.name.toLowerCase();
  const status = document.getElementById('fileStatus');
  status.className = 'file-status';

  if (name.endsWith('.zip')) {
    status.textContent = '📦 جاري فك ضغط الأرشيف...';
    status.classList.remove('hidden');
    await extractZip(file);
  } else if (name.endsWith('.html') || name.endsWith('.htm')) {
    // Single HTML file
    const url = URL.createObjectURL(file);
    processedGameUrl = url;
    uploadedGameUrl  = url;
    setStatus('success', `✓ تم اكتشاف ملف HTML: ${file.name}`);
    // Auto-fill title from filename
    const title = document.getElementById('gameTitle');
    if (title && !title.value) title.value = file.name.replace(/\.html?$/i,'');
  } else {
    setStatus('error', '⚠ صيغة غير مدعومة. استخدم: .html أو .zip');
  }
}

async function extractZip(file) {
  try {
    const JSZip = window.JSZip;
    if (!JSZip) {
      setStatus('error', '⚠ مكتبة JSZip غير محملة. استخدم رابط URL بدلاً من ذلك.');
      return;
    }
    const zip = await JSZip.loadAsync(file);
    const fileNames = Object.keys(zip.files);

    // Find index.html (try root first, then subdirectories)
    let indexEntry = null;
    let indexPath  = null;

    // Root level
    if (zip.files['index.html']) { indexEntry = zip.files['index.html']; indexPath = 'index.html'; }
    if (!indexEntry && zip.files['index.htm']) { indexEntry = zip.files['index.htm']; indexPath = 'index.htm'; }

    // Search subdirectories
    if (!indexEntry) {
      for (const name of fileNames) {
        if ((name.endsWith('/index.html') || name.endsWith('/index.htm')) && !zip.files[name].dir) {
          indexEntry = zip.files[name]; indexPath = name; break;
        }
      }
    }

    if (!indexEntry) {
      setStatus('error', '⚠ لم يتم العثور على index.html داخل الأرشيف');
      return;
    }

    // Build a virtual filesystem in memory using blob URLs
    const fileMap = {};
    for (const name of fileNames) {
      if (zip.files[name].dir) continue;
      const blob = await zip.files[name].async('blob');
      const mime = guessMime(name);
      fileMap[name] = URL.createObjectURL(new Blob([blob], { type: mime }));
    }

    // Rewrite index.html to point to local blobs
    const htmlContent = await indexEntry.async('string');
    const baseDir = indexPath.includes('/') ? indexPath.substring(0, indexPath.lastIndexOf('/') + 1) : '';
    const rewritten = rewriteHtml(htmlContent, baseDir, fileMap);
    const htmlBlob  = new Blob([rewritten], { type: 'text/html' });
    const htmlUrl   = URL.createObjectURL(htmlBlob);

    processedGameUrl = htmlUrl;
    uploadedGameUrl  = htmlUrl;

    const fileCount = fileNames.filter(n => !zip.files[n].dir).length;
    setStatus('success', `✓ تم فك الضغط بنجاح! ${fileCount} ملف — index.html: ${indexPath}`);

    const title = document.getElementById('gameTitle');
    if (title && !title.value) title.value = file.name.replace(/\.zip$/i,'');

  } catch (err) {
    setStatus('error', '⚠ خطأ في فك الضغط: ' + err.message);
  }
}

function rewriteHtml(html, baseDir, fileMap) {
  // Replace relative references in src, href, url() with blob URLs
  return html.replace(/(src|href)=["']([^"']+)["']/gi, (match, attr, val) => {
    if (val.startsWith('http') || val.startsWith('//') || val.startsWith('data:')) return match;
    const key = baseDir + val;
    if (fileMap[key]) return `${attr}="${fileMap[key]}"`;
    if (fileMap[val]) return `${attr}="${fileMap[val]}"`;
    return match;
  });
}

function guessMime(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = { html:'text/html', htm:'text/html', js:'application/javascript', css:'text/css',
    png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp',
    svg:'image/svg+xml', wasm:'application/wasm', json:'application/json',
    mp3:'audio/mpeg', ogg:'audio/ogg', wav:'audio/wav', mp4:'video/mp4' };
  return map[ext] || 'application/octet-stream';
}

function processFolderFiles(files) {
  // Find index.html among dropped folder files
  const htmlFile = files.find(f => f.name === 'index.html' || f.name === 'index.htm')
                || files.find(f => f.name.endsWith('.html') || f.name.endsWith('.htm'));
  if (!htmlFile) {
    setStatus('error', '⚠ لم يتم العثور على index.html في المجلد');
    return;
  }
  // Create object URLs for all files
  const urlMap = {};
  files.forEach(f => { urlMap[f.name] = URL.createObjectURL(f); });

  const reader = new FileReader();
  reader.onload = (e) => {
    const rewritten = rewriteHtml(e.target.result, '', urlMap);
    const blob = new Blob([rewritten], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    processedGameUrl = url;
    uploadedGameUrl  = url;
    setStatus('success', `✓ تم تحميل المجلد: ${files.length} ملف — index: ${htmlFile.name}`);
    const title = document.getElementById('gameTitle');
    if (title && !title.value) {
      const rel = htmlFile.webkitRelativePath || htmlFile.name;
      title.value = rel.split('/')[0] || 'لعبتي';
    }
  };
  reader.readAsText(htmlFile);
}

async function readFolderEntry(dirEntry) {
  // WebkitEntry API for dropped folders
  const allFiles = [];
  await collectEntries(dirEntry, allFiles);
  if (allFiles.length === 0) { setStatus('error', '⚠ المجلد فارغ'); return; }
  processFolderFiles(allFiles);
}

function collectEntries(entry, result) {
  return new Promise(resolve => {
    if (entry.isFile) {
      entry.file(f => { result.push(f); resolve(); });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      reader.readEntries(async entries => {
        for (const e of entries) await collectEntries(e, result);
        resolve();
      });
    } else resolve();
  });
}

function setStatus(type, msg) {
  const s = document.getElementById('fileStatus');
  if (!s) return;
  s.textContent = msg;
  s.className = `file-status ${type}`;
}

// ===== UPLOAD MODE SWITCH =====
function switchUploadMode(mode, btn) {
  document.querySelectorAll('.umode-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('uploadModeFile').classList.toggle('hidden', mode !== 'file');
  document.getElementById('uploadModeUrl').classList.toggle('hidden', mode !== 'url');
  if (mode === 'file') processedGameUrl = uploadedGameUrl;
  else processedGameUrl = null;
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

  // Determine game URL
  const urlMode = document.querySelector('.umode-tab.active')?.dataset.mode === 'url';
  let gameUrl = urlMode ? getVal('gameUrl').trim() : (processedGameUrl || '');

  // Thumbnail
  const thumbnail = uploadedThumbUrl || getVal('gameThumbnail').trim() || null;

  if (!title || !description) return showMsg('uploadMsg','يرجى ملء الحقول المطلوبة *','error');
  if (!gameUrl) return showMsg('uploadMsg','يرجى رفع ملف اللعبة أو إدخال رابط *','error');

  // If local blob URL, we need to use it as-is (only works in same session)
  // For production you'd upload to Supabase Storage instead
  if (gameUrl.startsWith('blob:')) {
    showMsg('uploadMsg','ملاحظة: روابط blob تعمل فقط في هذه الجلسة. للنشر الدائم استخدم رابط URL.','error');
    // Still allow saving for demo purposes
    gameUrl = gameUrl; // keep it for now
  }

  const tags  = rawTags ? rawTags.split(',').map(t => t.trim()).filter(Boolean) : [];
  const slug  = slugify(title);

  const btn = document.querySelector('#section-upload .btn-primary.full-w');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري الرفع...'; }

  const { data, error } = await sb.from('games').insert({
    title, description, engine, category,
    tags, game_url: gameUrl,
    thumbnail_url: thumbnail,
    uploader_id: currentUser.id,
    seo_enabled: seoEnabled,
    slug, likes_count: 0,
    created_at: new Date().toISOString()
  }).select().single();

  if (btn) { btn.disabled = false; btn.textContent = '🚀 نشر اللعبة'; }
  if (error) return showMsg('uploadMsg','خطأ: ' + error.message,'error');

  if (seoEnabled && data) await generateSEOMeta(data);

  showMsg('uploadMsg',`🎉 تم نشر "${title}" بنجاح!`,'success');
  clearUploadForm();
  await loadGames();
  showToast('تم نشر اللعبة! 🚀');
  setTimeout(() => showSection('browse'), 1800);
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
async function openGame(id) {
  const { data: g, error } = await sb.from('games').select(`*, profiles:uploader_id(username)`).eq('id', id).single();
  if (error || !g) return showToast('تعذر تحميل اللعبة');
  currentGame = g;

  document.getElementById('gmTitle').textContent    = g.title;
  document.getElementById('gmDesc').textContent     = g.description || '';
  document.getElementById('gmEngine').textContent   = g.engine || '';
  document.getElementById('gmCategory').textContent = g.category || '';
  document.getElementById('likeCount').textContent  = g.likes_count || 0;
  document.getElementById('gmUploader').textContent = g.profiles?.username || 'مجهول';

  const tagsEl = document.getElementById('gmTags');
  tagsEl.innerHTML = (g.tags || []).map(t => `<span class="tag">${escHtml(t)}</span>`).join('');

  document.getElementById('gameFrame').src = g.game_url;

  const liked = likedGames.has(id);
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
  const url = window.location.href.split('?')[0] + `?game=${currentGame?.id}`;
  if (navigator.share) navigator.share({ title: currentGame?.title, url });
  else { navigator.clipboard.writeText(url); showToast('تم نسخ الرابط 📋'); }
}
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
  const { data } = await sb.from('games').select(`*, profiles:uploader_id(username, avatar_url)`)
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
    if (f) f.src = '';
    document.title = 'GameVault — منصة الألعاب';
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
  processedGameUrl = null; uploadedGameUrl = null; uploadedThumbUrl = null;
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

// ===== DEEP LINK =====
(async () => {
  const params = new URLSearchParams(window.location.search);
  const gameId = params.get('game');
  if (gameId) { await checkSession(); await openGame(gameId); }
})();
