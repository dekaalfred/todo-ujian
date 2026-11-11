const ready = !SUPABASE_URL.includes("ISI_") && !SUPABASE_KEY.includes("ISI_");
const sb = ready ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
let todos = [], filter = "all", mode = "masuk";
const $ = id => document.getElementById(id);
const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function showErr(msg, id = 'err'){
  const e = $(id); e.textContent = msg; e.style.display = 'block';
  clearTimeout(e._t); e._t = setTimeout(() => e.style.display = 'none', 6000);
}
function setStatus(ok, text){ $('dot').className = 'dot' + (ok ? '' : ' off'); $('stat').textContent = text; }
function trErr(m = ''){
  if(/invalid login/i.test(m)) return 'Email atau password salah.';
  if(/already registered/i.test(m)) return 'Email ini sudah terdaftar. Pilih tab Masuk.';
  if(/at least 6|weak/i.test(m)) return 'Password minimal 6 karakter.';
  if(/rate limit/i.test(m)) return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
  if(/valid email|invalid format/i.test(m)) return 'Format email tidak valid.';
  return m;
}

/* Mode cadangan: kalau Supabase belum diisi, data disimpan di browser */
const local = {
  get(){ try{return JSON.parse(localStorage.getItem('todos')||'[]')}catch{return[]} },
  set(v){ try{localStorage.setItem('todos',JSON.stringify(v))}catch{} }
};

/* Tampilkan halaman login atau halaman aplikasi */
function view(loggedIn, email){
  $('auth').classList.toggle('hidden', loggedIn);
  $('app').classList.toggle('hidden', !loggedIn);
  $('prog').classList.toggle('hidden', !loggedIn);
  $('whobox').classList.toggle('hidden', !(loggedIn && sb));
  $('who').textContent = email ? 'Masuk sebagai ' + email : '';
  if(!loggedIn){ todos = []; setStatus(true, 'Silakan masuk atau daftar'); }
}

async function load(){
  if(!sb){ todos = local.get(); setStatus(false, 'Mode lokal (Supabase belum diisi)'); return render(); }
  const {data, error} = await sb.from('todos').select('*').order('created_at', {ascending:false});
  if(error){
    if(/jwt/i.test(error.message)){ await sb.auth.signOut(); return view(false); }
    setStatus(false, 'Gagal terhubung ke Supabase'); showErr('Gagal memuat data: ' + error.message); return;
  }
  todos = data; setStatus(true, 'Tersimpan di Supabase'); render();
}
async function add(title, priority, due){
  if(!sb){ todos.unshift({id:Date.now(), title, priority, due_date:due||null, is_done:false}); local.set(todos); return render(); }
  const {data, error} = await sb.from('todos').insert({title, priority, due_date:due||null}).select().single();
  if(error) return showErr('Gagal menambah: ' + error.message);
  todos.unshift(data); render();
}
async function toggle(id){
  const t = todos.find(x => x.id === id); if(!t) return;
  t.is_done = !t.is_done; render();
  if(!sb) return local.set(todos);
  const {error} = await sb.from('todos').update({is_done:t.is_done}).eq('id', id);
  if(error){ t.is_done = !t.is_done; render(); showErr('Gagal mengubah: ' + error.message); }
}
async function remove(id){
  const old = todos; todos = todos.filter(x => x.id !== id); render();
  if(!sb) return local.set(todos);
  const {error} = await sb.from('todos').delete().eq('id', id);
  if(error){ todos = old; render(); showErr('Gagal menghapus: ' + error.message); }
}

function fmt(d){ return d ? new Date(d+'T00:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) : 'Tanpa tenggat'; }

function render(){
  const done = todos.filter(t => t.is_done).length, total = todos.length, pct = total ? Math.round(done/total*100) : 0;
  $('pct').textContent = pct + '%'; $('cnt').textContent = `${done} dari ${total} selesai`;
  $('bar').style.strokeDashoffset = 502 - (502*pct/100);
  $('c-all').textContent = total; $('c-done').textContent = done; $('c-open').textContent = total - done;

  const shown = todos.filter(t => filter==='all' || (filter==='done' ? t.is_done : !t.is_done));
  $('list').innerHTML = shown.length ? shown.map(t => `
    <li class="${t.priority} ${t.is_done?'done':''}">
      <button class="chk" data-a="toggle" data-id="${t.id}" aria-label="Tandai selesai">✓</button>
      <div><div class="t">${esc(t.title)}</div><div class="m">${fmt(t.due_date)} · ${t.priority}</div></div>
      <button class="del" data-a="del" data-id="${t.id}" aria-label="Hapus tugas">✕</button>
    </li>`).join('')
    : `<li class="kosong"><div class="empty"><b>${total?'Tidak ada tugas di sini':'Belum ada tugas'}</b>${total?'Coba pilih filter lain.':'Tulis tugas pertamamu di atas.'}</div></li>`;
}

/* ===== Tugas ===== */
$('f').addEventListener('submit', e => {
  e.preventDefault();
  const title = $('title').value.trim(); if(!title) return;
  add(title, $('prio').value, $('due').value);
  $('title').value = ''; $('due').value = ''; $('title').focus();
});
$('list').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  const id = isNaN(b.dataset.id) ? b.dataset.id : Number(b.dataset.id);
  b.dataset.a === 'toggle' ? toggle(id) : remove(id);
});
$('tabs').addEventListener('click', e => {
  const b = e.target.closest('.tab'); if(!b) return;
  document.querySelectorAll('#tabs .tab').forEach(x => x.classList.remove('on')); b.classList.add('on');
  filter = b.dataset.f; render();
});

/* ===== Login ===== */
$('atabs').addEventListener('click', e => {
  const b = e.target.closest('.atab'); if(!b) return;
  document.querySelectorAll('.atab').forEach(x => x.classList.remove('on')); b.classList.add('on');
  mode = b.dataset.m;
  $('asubmit').textContent = mode === 'masuk' ? 'Masuk' : 'Buat akun';
  $('pw').autocomplete = mode === 'masuk' ? 'current-password' : 'new-password';
  $('anote').textContent = mode === 'masuk'
    ? 'Belum punya akun? Pilih tab Daftar. Setiap akun punya daftar tugas sendiri.'
    : 'Daftar cukup dengan email dan password. Kamu langsung masuk setelah akun dibuat.';
});
$('af').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('email').value.trim(), password = $('pw').value, btn = $('asubmit');
  btn.disabled = true;
  const res = mode === 'masuk'
    ? await sb.auth.signInWithPassword({email, password})
    : await sb.auth.signUp({email, password});
  btn.disabled = false;
  if(res.error) return showErr(trErr(res.error.message), 'aerr');
  if(!res.data.session) return showErr('Akun dibuat, tapi masih perlu konfirmasi email. Matikan "Confirm email" di Supabase, atau cek emailmu.', 'aerr');
  $('pw').value = '';
  view(true, res.data.user.email); load();
});
$('logout').addEventListener('click', async () => { await sb.auth.signOut(); view(false); });

/* ===== Mulai ===== */
(async () => {
  if(!sb){ view(true); return load(); }
  const {data} = await sb.auth.getSession();
  if(data.session){ view(true, data.session.user.email); load(); } else view(false);
})();
$('today').textContent = new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long'});