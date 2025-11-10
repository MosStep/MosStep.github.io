// app.js - shared application logic for Uni-Feed
const STORAGE_KEY = 'unifeed_posts_v1';
const TAGS_KEY = 'unifeed_tags_v1';
const FOLLOW_KEY = 'unifeed_follow_v1';
const LAST_SEEN_KEY = '_unifeed_last_seen';

// BroadcastChannel for reliable same-origin tab sync (fallback to storage event exists)
let __unifeed_channel = null;
try{
  if('BroadcastChannel' in window){
    __unifeed_channel = new BroadcastChannel('unifeed_channel');
    __unifeed_channel.addEventListener('message', (ev)=>{
      try{ console.log('BroadcastChannel message', ev.data); }catch(e){}
      if(ev && ev.data && ev.data.type === 'unifeed_update'){
        try{ renderTagsUI(); }catch(e){}
        try{ renderDashboard(); }catch(e){}
        try{ renderMyPosts(); }catch(e){}
      }
    });
  }
}catch(e){ __unifeed_channel = null; }

function escapeHtml(str){ if(!str) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

function loadPosts(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){
    console.warn('Failed to parse posts JSON, clearing storage', e);
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

function savePosts(posts){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  try{ localStorage.setItem('_unifeed_last_update', String(Date.now())); }catch(e){}
  try{ if(__unifeed_channel) __unifeed_channel.postMessage({ type: 'unifeed_update', key: STORAGE_KEY }); }catch(e){}
  try{ updateNotificationsUI(); }catch(e){}
}

function loadTags(){
  try{
    const raw = localStorage.getItem(TAGS_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){
    console.warn('Failed to parse tags JSON, clearing', e);
    localStorage.removeItem(TAGS_KEY);
    return [];
  }
}

function saveTags(tags){
  localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
  try{ localStorage.setItem('_unifeed_last_update', String(Date.now())); }catch(e){}
  try{ if(__unifeed_channel) __unifeed_channel.postMessage({ type: 'unifeed_update', key: TAGS_KEY }); }catch(e){}
}

function addTagsToStore(newTags){
  if(!newTags || !newTags.length) return;
  const existing = loadTags();
  const set = new Set(existing.map(t=>t.toLowerCase()));
  newTags.forEach(t=>{ const n = t.startsWith('#')? t : ('#'+t); if(!set.has(n.toLowerCase())) { set.add(n.toLowerCase()); existing.push(n); } });
  saveTags(existing);
}

function loadFollow(){
  try{
    const raw = localStorage.getItem(FOLLOW_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch(e){
    console.warn('Failed to parse follow state, clearing', e);
    localStorage.removeItem(FOLLOW_KEY);
    return {};
  }
}

function saveFollow(obj){
  localStorage.setItem(FOLLOW_KEY, JSON.stringify(obj));
  try{ localStorage.setItem('_unifeed_last_update', String(Date.now())); }catch(e){}
  try{ if(__unifeed_channel) __unifeed_channel.postMessage({ type: 'unifeed_update', key: FOLLOW_KEY }); }catch(e){}
}

function getTagCounts(){
  const posts = loadPosts();
  const counts = {};
  posts.forEach(p=>{
    (p.tags||[]).forEach(t=>{ const key = t; counts[key] = (counts[key] || 0) + 1; });
  });
  return counts;
}

// Notifications: track unseen posts and update UI
function getLastSeen(){ try{ return localStorage.getItem(LAST_SEEN_KEY); }catch(e){return null;} }
function setLastSeen(ts){ try{ localStorage.setItem(LAST_SEEN_KEY, ts); }catch(e){} }

function updateNotificationsUI(){
  try{
    const dot = document.getElementById('notifDot');
    const posts = loadPosts();
    const lastSeen = getLastSeen();
    let unseen = 0;
    posts.forEach(p=>{ if(!p || !p.date) return; const pd = new Date(p.date); if(!lastSeen || pd > new Date(lastSeen)) unseen++; });
    if(dot) dot.style.display = unseen > 0 ? 'block' : 'none';
    // update document title with unread count for quick visibility
    if(unseen > 0) document.title = `(${unseen}) Uni-Feed`; else document.title = 'Uni-Feed';
    window.__unifeed_unseen = unseen;
  }catch(e){ console.warn('updateNotificationsUI failed', e); }
}

function showNotificationsShared(){
  try{
    const posts = loadPosts().sort((a,b)=> new Date(b.date) - new Date(a.date));
    const lastSeen = getLastSeen();
    const unseen = posts.filter(p=> p && p.date && (!lastSeen || new Date(p.date) > new Date(lastSeen)) );
    if(!unseen || unseen.length === 0){ alert('ไม่มีการแจ้งเตือนใหม่'); return; }
    const list = unseen.slice(0,10).map(p=>{
      let t = '';
      try{ t = new Date(p.date).toLocaleString('th-TH', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false }); }catch(e){ t = new Date(p.date).toString(); }
      return `${t} — ${p.title}${(p.tags && p.tags.length)? '\nแท็ก: '+p.tags.join(' ') : ''}`;
    }).join('\n\n');
    alert('การแจ้งเตือนใหม่:\n\n' + list);
    // mark as seen
    setLastSeen(new Date().toISOString());
    updateNotificationsUI();
  }catch(e){ console.warn('showNotificationsShared failed', e); alert('เกิดข้อผิดพลาดในการแสดงการแจ้งเตือน'); }
}

function renderTagsUI(){
  const container = document.getElementById('followTags');
  if(!container) return;
  const tags = loadTags().slice().sort((a,b)=> a.localeCompare(b, undefined, {sensitivity:'base'}));
  const followState = loadFollow();
  const counts = getTagCounts();
  container.innerHTML = '';
  if(tags.length === 0){ container.innerHTML = '<p style="color:#6b7280">ยังไม่มีแท็ก</p>'; return; }
  tags.forEach(tag => {
    const id = 'follow_tag_' + tag.replace(/[^a-zA-Z0-9]/g,'');
    const label = document.createElement('label');
    label.style.display = 'block';
    const chk = document.createElement('input');
    chk.type = 'checkbox'; chk.dataset.tag = tag;
    // default to true unless the follow state explicitly has false
    chk.checked = (followState[tag] === undefined) ? true : !!followState[tag];
    chk.addEventListener('change', (e)=>{ const obj = loadFollow(); obj[tag] = !!e.target.checked; saveFollow(obj); applyFollowFilter(); });
    label.appendChild(chk);
    const count = counts[tag] || 0;
    label.appendChild(document.createTextNode(' ' + tag + (count? ' ('+count+')' : '')));
    container.appendChild(label);
  });
}

function applyFollowFilter(){
  const container = document.getElementById('followTags');
  if(!container) { renderDashboard(); return; }
  const checks = Array.from(container.querySelectorAll('input[type="checkbox"]')).filter(c=>c.checked).map(c=>c.dataset.tag);
  if(!checks || checks.length === 0){ renderDashboard(); return; }
  // render posts that match any of the checked tags
  renderDashboard(checks);
}

function renderDashboard(filter){
  let posts = loadPosts().sort((a,b)=> new Date(b.date) - new Date(a.date));
  const container = document.getElementById('postsContainer');
  if(!container) return;
  // hide posts scheduled in the future
  const now = new Date();
  posts = posts.filter(p => {
    const pd = new Date(p.date);
    return !isNaN(pd.getTime()) && pd <= now;
  });
  // apply filter if provided
  if(filter){
    if(Array.isArray(filter)){
      const set = new Set(filter.map(t=>t.toLowerCase()));
      posts = posts.filter(p=> (p.tags||[]).some(t=> set.has(t.toLowerCase())) );
    } else {
      const q = String(filter).toLowerCase();
      posts = posts.filter(p=>{
        if(q.startsWith('#')){
          // match tag exactly
          return (p.tags||[]).some(t=>t.toLowerCase() === q);
        }
        // search in title, body, author, tags
        if((p.title||'').toLowerCase().includes(q)) return true;
        if((p.body||p.content||'').toLowerCase().includes(q)) return true;
        if((p.author||'').toLowerCase().includes(q)) return true;
        if((p.tags||[]).join(' ').toLowerCase().includes(q)) return true;
        return false;
      });
    }
  }

  container.innerHTML = '';
  if(posts.length === 0){ container.innerHTML = '<p style="color:#6b7280">ยังไม่มีประกาศ</p>'; return; }
  posts.forEach(p=>{
    const d=document.createElement('div'); d.className='post';
    const h=document.createElement('h3');
    h.innerText = (p.tags && p.tags.length ? p.tags.join(' ') + ' - ' : '') + p.title;
    d.appendChild(h);
    if(p.author){ const sig=document.createElement('div'); sig.className='signature'; sig.innerText = 'ลงชื่อ: ' + p.author; d.appendChild(sig); }
    const pEl=document.createElement('p'); pEl.innerText = p.body || p.content || ''; d.appendChild(pEl);
    const meta=document.createElement('div'); meta.style.marginTop='8px'; meta.style.fontSize='12px'; meta.style.color='#6b7280';
    try{
      meta.innerText = new Date(p.date).toLocaleString('th-TH', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false }) + (p.priority? ' | ' + p.priority : '');
    }catch(e){
      meta.innerText = new Date(p.date).toLocaleString() + (p.priority? ' | ' + p.priority : '');
    }
    d.appendChild(meta);
    container.appendChild(d);
  });
  // update last-updated indicator if present
  try{ updateLastUpdated(); }catch(e){}
  try{ updateNotificationsUI(); }catch(e){}
}

function updateLastUpdated(){
  const el = document.getElementById('lastUpdated');
  if(!el) return;
  try{
    el.innerText = 'Last updated: ' + new Date().toLocaleString('th-TH', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false });
  }catch(e){ el.innerText = 'Last updated: ' + new Date().toLocaleString(); }
}

// The user's function, adapted to support commas/whitespace and saving to localStorage
function postAnnouncementExternal(){
  const authorEl = document.getElementById('author');
  const titleEl = document.getElementById('title');
  const contentEl = document.getElementById('content');
  const tagsEl = document.getElementById('tags');
  const priorityEl = document.getElementById('priority');

  const author = authorEl ? authorEl.value.trim() : '';
  const title = titleEl ? titleEl.value.trim() : '';
  const content = contentEl ? contentEl.value.trim() : '';
  const tagsRaw = tagsEl ? tagsEl.value.trim() : '';
  const scheduledDateEl = document.getElementById('scheduledDate');
  const scheduledTimeEl = document.getElementById('scheduledTime');
  const scheduledDateVal = scheduledDateEl ? scheduledDateEl.value : '';
  const scheduledTimeVal = scheduledTimeEl ? scheduledTimeEl.value : '';

  if (!author || !title || !content) {
    alert('กรุณากรอกข้อมูลให้ครบ');
    return;
  }

  // split by comma or whitespace
  const parts = tagsRaw ? tagsRaw.split(/[,\s]+/).map(s=>s.trim()).filter(Boolean) : [];
  const tags = parts.map(t => t.startsWith('#') ? t : ('#' + t));

  const posts = loadPosts();
  // require scheduledDate (calendar date) and validate; time optional (defaults to 00:00)
  if(!scheduledDateVal){
    alert('กรุณาเลือกวันที่สำหรับประกาศ (required)');
    return;
  }
  // combine date and time into a local Date (require 24-hour HH:MM)
  const timePart = scheduledTimeVal ? scheduledTimeVal : '00:00';
  // validate timePart is HH:MM 24-hour
  if(!/^[0-2][0-9]:[0-5][0-9]$/.test(timePart)){
    alert('โปรดระบุเวลาในรูปแบบ 24 ชั่วโมง HH:MM (เช่น 09:30)');
    return;
  }
  // parse date and time parts and construct local Date object to avoid timezone parsing issues
  const dateParts = scheduledDateVal.split('-'); // YYYY-MM-DD
  const timeParts = timePart.split(':');
  if(dateParts.length !== 3 || timeParts.length !== 2){ alert('วันที่/เวลาไม่ถูกต้อง'); return; }
  const y = parseInt(dateParts[0],10), m = parseInt(dateParts[1],10), d = parseInt(dateParts[2],10);
  const hh = parseInt(timeParts[0],10), mm = parseInt(timeParts[1],10);
  const scheduledDate = new Date(y, m-1, d, hh, mm);
  if(isNaN(scheduledDate.getTime())){ alert('วันที่/เวลาไม่ถูกต้อง'); return; }
  const dateIso = scheduledDate.toISOString();
  const post = { id: Date.now(), author, title, body: content, tags, date: dateIso, priority: priorityEl ? priorityEl.value : 'ทั่วไป' };
  posts.unshift(post);
  savePosts(posts);
  // add tags to global tag store so follow list updates
  addTagsToStore(tags);
  renderTagsUI();

  alert('ประกาศสำเร็จ: ' + title);

  if(authorEl) authorEl.value = '';
  if(titleEl) titleEl.value = '';
  if(contentEl) contentEl.value = '';
  if(tagsEl) tagsEl.value = '';
  if(priorityEl) priorityEl.value = 'ทั่วไป';

  renderDashboard();
  // ensure the dashboard view is visible when announcement posted
  try{ if(typeof showPage === 'function') showPage('dashboard'); }catch(e){}
}

// expose friendly global name expected by inline HTML
window.postAnnouncementExternal = postAnnouncementExternal;

// helper to render my posts table if present
function renderMyPosts(){
  const posts = loadPosts().sort((a,b)=> new Date(b.date) - new Date(a.date));
  const tbody = document.getElementById('postsTableBody');
  if(!tbody) return;
  tbody.innerHTML = '';
  posts.forEach(p=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(new Date(p.date).toLocaleString())}</td>
      <td>${escapeHtml(p.title)}</td>
      <td>${escapeHtml((p.tags||[]).join(', '))}</td>
      <td>${escapeHtml(p.author||'')}</td>
      <td>${escapeHtml(p.priority||'')}</td>
      <td>${escapeHtml(p.body||p.content||'')}</td>
    `;
    tbody.appendChild(tr);
  });
}

// init on load
document.addEventListener('DOMContentLoaded', ()=>{
  renderDashboard();
  renderMyPosts();

  // wire search input (if present) to filter results live
  const searchBox = document.getElementById('searchBox');
  if(searchBox){
    searchBox.addEventListener('input', (e)=>{
      const q = e.target.value.trim();
      renderDashboard(q);
    });
  }

  // wire refresh button and auto-refresh
  let autoInterval = null;
  const refreshBtn = document.getElementById('refreshPostsBtn');
  if(refreshBtn) refreshBtn.addEventListener('click', ()=>{ renderDashboard(); renderMyPosts(); });
  const autoChk = document.getElementById('autoRefreshChk');
  function startAuto(){ if(autoInterval) return; autoInterval = setInterval(()=>{ renderDashboard(); renderMyPosts(); }, 5000); }
  function stopAuto(){ if(!autoInterval) return; clearInterval(autoInterval); autoInterval = null; }
  if(autoChk){
    autoChk.addEventListener('change', (e)=>{ if(e.target.checked) startAuto(); else stopAuto(); });
    if(autoChk.checked) startAuto();
  }
  // render tag UI (follow list)
  renderTagsUI();
  // apply follow filter initial state
  applyFollowFilter();
  // update notification UI initial state
  try{ updateNotificationsUI(); }catch(e){}
});

// react to storage changes from other tabs/windows
window.addEventListener('storage', (e) => {
  if(!e) return;
  // helpful debug logging when storage events arrive
  try{ console.log('storage event', e.key, e.newValue && e.newValue.slice ? e.newValue.slice(0,100) : e.newValue); }catch(err){}
  if(e.key === STORAGE_KEY || e.key === TAGS_KEY || e.key === FOLLOW_KEY || e.key === '_unifeed_last_update'){
    // re-render UI to reflect external changes
    try{ renderTagsUI(); }catch(err){}
    try{ renderDashboard(); }catch(err){}
    try{ renderMyPosts(); }catch(err){}
  }
});

// expose a manual refresh helper for debugging/testing
window.forceRefresh = function(){
  try{ console.log('forceRefresh invoked'); }catch(e){}
  try{ renderTagsUI(); }catch(e){}
  try{ renderDashboard(); }catch(e){}
  try{ renderMyPosts(); }catch(e){}
}
