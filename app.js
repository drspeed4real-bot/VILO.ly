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

// ===== INIT =====
window.addEventListener('DOMContentLoaded', async () => {
  await checkSession();
  await loadGames();
  initSearchEnter();
});

async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    await loadProfile();
    updateNavUser();
  }
}

// ===== AUTH =====
async function register() {
  const username = document.getElementById('regUsername').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;

  if (!username || !email || !password) return showMsg('registerMsg', 'يرجى ملء جميع الحقول', 'error');
  if (password.length < 6) return showMsg('registerMsg', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');

  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) return showMsg('registerMsg', error.message, 'error');

  currentUser = data.user;
  // Create profile
  await sb.from('profiles').upsert({
    id: currentUser.id,
    username,
    email,
    created_at: new Date().toISOString()
  });

  await loadProfile();
  updateNavUser();
  closeModal('registerModal');
  showToast(`مرحباً ${username}! 🎮`);
}

async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) return showMsg('loginMsg', 'يرجى إدخال البيانات', 'error');

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return showMsg('loginMsg', 'بيانات غير صحيحة', 'error');

  currentUser = data.user;
  await loadProfile();
  updateNavUser();
  closeModal('loginModal');
  showToast(`أهلاً بعودتك ${currentProfile?.username || ''} 👋`);
  await loadLikedGames();
}

async function logout() {
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
  likedGames.clear();
  document.getElementById('navActions').classList.remove('hidden');
  document.getElementById('navUser').classList.add('hidden');
  showSection('browse');
  showToast('تم تسجيل الخروج');
}

function requireAuth(callback) {
  if (!currentUser) {
    showModal('loginModal');
    return;
  }
  callback();
}

// ===== PROFILE =====
async function loadProfile() {
  if (!currentUser) return;
  const { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
  if (data) {
    currentProfile = data;
    populateProfileForm();
  }
  await loadLikedGames();
}

function populateProfileForm() {
  if (!currentProfile) return;
  setInputVal('profileUsername', currentProfile.username || '');
  setInputVal('profileEmail', currentUser?.email || '');
  setInputVal('profilePhone', currentProfile.phone || '');
  setInputVal('profileBio', currentProfile.bio || '');

  // Avatar
  const avatarEl = document.getElementById('profileAvatar');
  const navAvatarEl = document.getElementById('navAvatar');
  if (currentProfile.avatar_url) {
    avatarEl.innerHTML = `<img src="${currentProfile.avatar_url}" alt="avatar" />`;
    navAvatarEl.innerHTML = `<img src="${currentProfile.avatar_url}" alt="avatar" />`;
  } else {
    const initials = (currentProfile.username || 'U')[0].toUpperCase();
    avatarEl.textContent = initials;
    navAvatarEl.textContent = initials;
  }
}

async function saveProfile() {
  if (!currentUser) return;
  const updates = {
    id: currentUser.id,
    username: getInputVal('profileUsername'),
    phone: getInputVal('profilePhone'),
    bio: getInputVal('profileBio'),
    updated_at: new Date().toISOString()
  };

  const { error } = await sb.from('profiles').upsert(updates);
  if (error) return showMsg('profileMsg', 'حدث خطأ: ' + error.message, 'error');

  currentProfile = { ...currentProfile, ...updates };
  updateNavUser();
  showMsg('profileMsg', 'تم حفظ الملف الشخصي ✓', 'success');
  showToast('تم الحفظ بنجاح ✓');
}

async function uploadAvatar(event) {
  const file = event.target.files[0];
  if (!file || !currentUser) return;

  const ext = file.name.split('.').pop();
  const fileName = `${currentUser.id}/avatar.${ext}`;

  const { error: upErr } = await sb.storage.from('avatars').upload(fileName, file, { upsert: true });
  if (upErr) return showToast('خطأ في رفع الصورة');

  const { data: urlData } = sb.storage.from('avatars').getPublicUrl(fileName);
  const avatarUrl = urlData.publicUrl;

  await sb.from('profiles').update({ avatar_url: avatarUrl }).eq('id', currentUser.id);
  currentProfile = { ...currentProfile, avatar_url: avatarUrl };

  document.getElementById('profileAvatar').innerHTML = `<img src="${avatarUrl}" alt="avatar" />`;
  document.getElementById('navAvatar').innerHTML = `<img src="${avatarUrl}" alt="avatar" />`;
  showToast('تم تحديث الصورة ✓');
}

function updateNavUser() {
  if (!currentUser) return;
  document.getElementById('navActions').classList.add('hidden');
  document.getElementById('navUser').classList.remove('hidden');
  document.getElementById('navUsername').textContent = currentProfile?.username || currentUser.email.split('@')[0];

  if (currentProfile?.avatar_url) {
    document.getElementById('navAvatar').innerHTML = `<img src="${currentProfile.avatar_url}" alt="" />`;
  } else {
    document.getElementById('navAvatar').textContent = (currentProfile?.username || 'U')[0].toUpperCase();
  }
}

function goToProfile() {
  requireAuth(() => showSection('profile'));
}

// ===== GAMES =====
async function loadGames() {
  const grid = document.getElementById('gamesGrid');
  grid.innerHTML = '<div class="loader">⏳ جاري التحميل...</div>';

  const engine = document.getElementById('filterEngine')?.value || '';
  const sort = document.getElementById('filterSort')?.value || 'created_at';

  let query = sb.from('games').select(`
    *,
    profiles:uploader_id (username, avatar_url)
  `).order(sort === 'likes' ? 'likes_count' : 'created_at', { ascending: false });

  if (engine) query = query.eq('engine', engine);

  const { data, error } = await query.limit(50);
  if (error) { grid.innerHTML = '<div class="loader">خطأ في التحميل</div>'; return; }

  if (!data || data.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🎮</div><p>لا توجد ألعاب بعد. كن أول من يرفع!</p></div>`;
    return;
  }

  grid.innerHTML = data.map(g => gameCardHTML(g)).join('');
}

async function loadMyGames() {
  if (!currentUser) return;
  const grid = document.getElementById('myGamesGrid');
  grid.innerHTML = '<div class="loader">⏳ جاري التحميل...</div>';

  const { data } = await sb.from('games')
    .select('*').eq('uploader_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (!data || data.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>لم ترفع ألعاباً بعد</p></div>`;
    return;
  }
  grid.innerHTML = data.map(g => gameCardHTML(g, true)).join('');
}

async function loadLikedGames() {
  if (!currentUser) return;
  const { data } = await sb.from('game_likes')
    .select('game_id').eq('user_id', currentUser.id);
  if (data) likedGames = new Set(data.map(r => r.game_id));
}

function gameCardHTML(g, showDelete = false) {
  const tags = g.tags ? g.tags.slice(0, 3).map(t => `<span class="tag">${t}</span>`).join('') : '';
  const thumb = g.thumbnail_url
    ? `<img class="game-thumbnail" src="${g.thumbnail_url}" alt="${g.title}" loading="lazy" />`
    : `<div class="game-thumb-placeholder">${engineEmoji(g.engine)}</div>`;
  const seoBadge = g.seo_enabled ? `<span class="seo-badge">🔍 SEO</span>` : '';
  const deleteBtn = showDelete ? `<button onclick="deleteGame(event,'${g.id}')" style="color:var(--red);background:none;border:none;cursor:pointer;font-size:0.75rem;">🗑 حذف</button>` : '';

  return `
  <div class="game-card" onclick="openGame('${g.id}')">
    <div style="position:relative">
      ${thumb}
      <span class="engine-badge">${g.engine}</span>
      ${seoBadge}
    </div>
    <div class="game-card-body">
      <div class="game-card-title">${escHtml(g.title)}</div>
      <div class="game-card-desc">${escHtml(g.description || '')}</div>
      <div class="card-tags">${tags}</div>
      <div class="game-card-footer">
        <span class="game-card-likes">🤍 ${g.likes_count || 0}</span>
        ${deleteBtn}
      </div>
    </div>
  </div>`;
}

async function uploadGame() {
  if (!currentUser) return showModal('loginModal');

  const title = getInputVal('gameTitle').trim();
  const description = getInputVal('gameDesc').trim();
  const engine = getInputVal('gameEngine');
  const category = getInputVal('gameCategory');
  const rawTags = getInputVal('gameTags').trim();
  const gameUrl = getInputVal('gameUrl').trim();
  const thumbnail = getInputVal('gameThumbnail').trim();

  if (!title || !description || !gameUrl) return showMsg('uploadMsg', 'يرجى ملء الحقول المطلوبة *', 'error');

  const tags = rawTags ? rawTags.split(',').map(t => t.trim()).filter(Boolean) : [];
  const slug = slugify(title);

  const { data, error } = await sb.from('games').insert({
    title, description, engine, category,
    tags, game_url: gameUrl,
    thumbnail_url: thumbnail || null,
    uploader_id: currentUser.id,
    seo_enabled: seoEnabled,
    slug,
    likes_count: 0,
    created_at: new Date().toISOString()
  }).select().single();

  if (error) return showMsg('uploadMsg', 'خطأ: ' + error.message, 'error');

  // Generate SEO meta if enabled
  if (seoEnabled && data) {
    await generateSEOMeta(data);
  }

  showMsg('uploadMsg', `🎉 تم نشر "${title}" بنجاح!`, 'success');
  clearUploadForm();
  await loadGames();
  showToast('تم نشر اللعبة! 🚀');
  setTimeout(() => showSection('browse'), 1500);
}

async function generateSEOMeta(game) {
  // Update game with SEO-friendly metadata
  const metaDesc = `${game.description?.slice(0, 155)}...`;
  await sb.from('games').update({
    meta_description: metaDesc,
    meta_keywords: game.tags?.join(', ') || ''
  }).eq('id', game.id);
}

async function deleteGame(e, id) {
  e.stopPropagation();
  if (!confirm('هل أنت متأكد من حذف هذه اللعبة؟')) return;
  const { error } = await sb.from('games').delete().eq('id', id).eq('uploader_id', currentUser.id);
  if (error) return showToast('خطأ في الحذف');
  showToast('تم حذف اللعبة');
  await loadMyGames();
  await loadGames();
}

// ===== GAME MODAL =====
async function openGame(id) {
  const { data: g, error } = await sb.from('games')
    .select(`*, profiles:uploader_id (username)`)
    .eq('id', id).single();

  if (error || !g) return showToast('تعذر تحميل اللعبة');
  currentGame = g;

  document.getElementById('gmTitle').textContent = g.title;
  document.getElementById('gmDesc').textContent = g.description || '';
  document.getElementById('gmEngine').textContent = g.engine;
  document.getElementById('gmCategory').textContent = g.category || '';
  document.getElementById('likeCount').textContent = g.likes_count || 0;
  document.getElementById('gmUploader').textContent = g.profiles?.username || 'مجهول';

  const tagsEl = document.getElementById('gmTags');
  tagsEl.innerHTML = (g.tags || []).map(t => `<span class="tag">${escHtml(t)}</span>`).join('');

  // iframe
  document.getElementById('gameFrame').src = g.game_url;

  // Like state
  const liked = likedGames.has(id);
  document.getElementById('likeIcon').textContent = liked ? '❤️' : '🤍';
  document.getElementById('likeBtn').className = 'action-btn like-btn' + (liked ? ' liked' : '');

  // Embed code
  const embedCode = `<iframe src="${g.game_url}" width="800" height="600" frameborder="0" allowfullscreen title="${g.title}"></iframe>`;
  document.getElementById('embedCode').value = embedCode;

  // Hide embed box
  document.getElementById('embedBox').classList.add('hidden');

  showModal('gameModal');

  // SEO meta tags update
  if (g.seo_enabled) {
    document.title = `${g.title} — GameVault`;
    setMeta('description', g.meta_description || g.description);
    setMeta('keywords', (g.tags || []).join(', '));
    setOg('title', g.title);
    setOg('description', g.description);
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
    await sb.from('games').update({ likes_count: currentGame.likes_count }).eq('id', id);
    document.getElementById('likeIcon').textContent = '🤍';
    document.getElementById('likeBtn').classList.remove('liked');
  } else {
    await sb.from('game_likes').insert({ user_id: currentUser.id, game_id: id });
    likedGames.add(id);
    currentGame.likes_count = (currentGame.likes_count || 0) + 1;
    await sb.from('games').update({ likes_count: currentGame.likes_count }).eq('id', id);
    document.getElementById('likeIcon').textContent = '❤️';
    document.getElementById('likeBtn').classList.add('liked');
  }
  document.getElementById('likeCount').textContent = currentGame.likes_count;
  await loadGames();
}

function shareGame() {
  const url = window.location.href.split('?')[0] + `?game=${currentGame?.id}`;
  if (navigator.share) {
    navigator.share({ title: currentGame?.title, url });
  } else {
    navigator.clipboard.writeText(url);
    showToast('تم نسخ الرابط 📋');
  }
}

function showEmbed() {
  document.getElementById('embedBox').classList.toggle('hidden');
}

function copyEmbed() {
  const ta = document.getElementById('embedCode');
  ta.select();
  navigator.clipboard.writeText(ta.value);
  showToast('تم نسخ كود التضمين 📋');
}

function closeGameModal(event) {
  if (event.target.classList.contains('modal-overlay')) {
    document.querySelectorAll('.modal-overlay.open').forEach(m => {
      m.classList.remove('open');
      if (m.id === 'gameModal') {
        document.getElementById('gameFrame').src = '';
        // Restore title
        document.title = 'GameVault — منصة الألعاب';
      }
    });
  }
}

// ===== SEARCH =====
async function performSearch() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) return loadGames();

  showSection('browse');
  const grid = document.getElementById('gamesGrid');
  grid.innerHTML = '<div class="loader">🔍 جاري البحث...</div>';

  const { data } = await sb.from('games')
    .select(`*, profiles:uploader_id (username, avatar_url)`)
    .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
    .order('created_at', { ascending: false });

  if (!data || data.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>لا نتائج لـ "${escHtml(q)}"</p></div>`;
    return;
  }
  grid.innerHTML = data.map(g => gameCardHTML(g)).join('');
}

function initSearchEnter() {
  document.getElementById('searchInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') performSearch();
  });
}

// ===== SECTIONS =====
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === name);
  });

  const sec = document.getElementById(`section-${name}`);
  if (sec) {
    sec.classList.add('active');
    document.querySelector('.main-content').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (name === 'profile') loadMyGames();
  if (name === 'browse') loadGames();
}

// ===== TOGGLE SEO =====
function toggleSeo() {
  seoEnabled = !seoEnabled;
  const toggle = document.getElementById('seoToggle');
  toggle.dataset.on = seoEnabled.toString();
}

// ===== MODALS =====
function showModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  if (id === 'gameModal') {
    document.getElementById('gameFrame').src = '';
    document.title = 'GameVault — منصة الألعاب';
  }
}

function switchModal(from, to) {
  closeModal(from);
  setTimeout(() => showModal(to), 100);
}

// ===== HELPERS =====
function showMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = `msg ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function getInputVal(id) {
  return document.getElementById(id)?.value || '';
}

function setInputVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function slugify(str) {
  return str.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\-]/g, '').slice(0, 60);
}

function engineEmoji(eng) {
  const map = { html: '🌐', unity: '⬡', godot: '🤖', ue4: '🔷' };
  return map[eng] || '🎮';
}

function clearUploadForm() {
  ['gameTitle','gameDesc','gameTags','gameUrl','gameThumbnail'].forEach(id => setInputVal(id, ''));
}

function setMeta(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) { el = document.createElement('meta'); el.name = name; document.head.appendChild(el); }
  el.content = content || '';
}

function setOg(prop, content) {
  let el = document.querySelector(`meta[property="og:${prop}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute('property', `og:${prop}`); document.head.appendChild(el); }
  el.content = content || '';
}

// ===== HANDLE URL PARAMS (deep link) =====
(async () => {
  const params = new URLSearchParams(window.location.search);
  const gameId = params.get('game');
  if (gameId) {
    await checkSession();
    await openGame(gameId);
  }
})();

// ===== SUPABASE DB SETUP HINT (run once) =====
/*
  Run this SQL in your Supabase SQL Editor to create the required tables:

  -- profiles table
  create table if not exists profiles (
    id uuid references auth.users primary key,
    username text,
    email text,
    phone text,
    bio text,
    avatar_url text,
    created_at timestamptz default now(),
    updated_at timestamptz
  );

  -- games table
  create table if not exists games (
    id uuid default gen_random_uuid() primary key,
    title text not null,
    description text,
    engine text,
    category text,
    tags text[],
    game_url text not null,
    thumbnail_url text,
    uploader_id uuid references auth.users,
    seo_enabled boolean default true,
    slug text,
    likes_count int default 0,
    meta_description text,
    meta_keywords text,
    created_at timestamptz default now()
  );

  -- game_likes table
  create table if not exists game_likes (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users,
    game_id uuid references games,
    created_at timestamptz default now(),
    unique(user_id, game_id)
  );

  -- Enable RLS
  alter table profiles enable row level security;
  alter table games enable row level security;
  alter table game_likes enable row level security;

  -- Policies
  create policy "Public read profiles" on profiles for select using (true);
  create policy "Users update own profile" on profiles for all using (auth.uid() = id);

  create policy "Public read games" on games for select using (true);
  create policy "Auth users insert games" on games for insert with check (auth.uid() = uploader_id);
  create policy "Users update own games" on games for update using (auth.uid() = uploader_id);
  create policy "Users delete own games" on games for delete using (auth.uid() = uploader_id);

  create policy "Public read likes" on game_likes for select using (true);
  create policy "Auth users manage likes" on game_likes for all using (auth.uid() = user_id);

  -- Storage bucket for avatars (create via dashboard: Storage > New bucket "avatars", public)
*/
