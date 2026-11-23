// ============================================================
// PENGATURAN AWAL
// ============================================================

// Mengecek apakah config.js sudah diisi.
// Jika URL/KEY masih mengandung tulisan "ISI_", berarti belum diisi.
// "!" artinya NOT (kebalikan), "&&" artinya DAN (keduanya harus benar).
const ready =
    !SUPABASE_URL.includes("ISI_") &&
    !SUPABASE_KEY.includes("ISI_");

// Membuat koneksi ke Supabase jika sudah dikonfigurasi.
// Jika belum, sb = null dan aplikasi memakai mode lokal (localStorage).
// Bentuk "kondisi ? A : B" disebut operator ternary (jika benar A, jika salah B).
const sb = ready
    ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

// Variabel global (dipakai di banyak fungsi)
let todos = [];       // array penyimpan semua tugas
let filter = "all";   // filter tab yang aktif: all / open / done
let mode = "masuk";   // mode form login: masuk / daftar
let keyword = "";     // kata kunci pencarian (disimpan dalam huruf kecil)

// Fungsi singkat untuk mengambil elemen HTML berdasarkan id-nya.
// Contoh: $("title") sama dengan document.getElementById("title")
const $ = id => document.getElementById(id);

// Fungsi esc: mengubah karakter berbahaya menjadi kode HTML yang aman.
// Tujuannya mencegah XSS (penyisipan skrip jahat lewat input pengguna).
// ?? "" artinya: jika nilainya null/undefined, pakai teks kosong.
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
}[c]));

// ============================================================
// PENCARIAN
// ============================================================

// Mengecek apakah sebuah tugas (t) cocok dengan kata kunci pencarian.
function matchSearch(t) {
    // Jika kata kunci kosong, semua tugas dianggap cocok
    if (!keyword) return true;

    // Gabungkan judul + catatan lalu ubah ke huruf kecil
    // agar pencarian tidak membedakan huruf besar/kecil
    const text = ((t.title || "") + " " + (t.note || "")).toLowerCase();

    // includes() = true jika kata kunci ada di dalam teks
    return text.includes(keyword);
}

// Memberi stabilo (<mark>) pada bagian teks yang cocok dengan kata kunci.
function hl(text) {
    const s = String(text ?? "");

    // Tanpa kata kunci, cukup kembalikan teks yang sudah aman (di-escape)
    if (!keyword) return esc(s);

    const lower = s.toLowerCase(); // versi huruf kecil untuk dicari
    let out = "";                  // hasil akhir
    let i = 0;                     // posisi awal pencarian

    // Ulangi sampai tidak ada lagi kata yang cocok
    while (true) {
        // Cari posisi kata kunci mulai dari posisi i
        const j = lower.indexOf(keyword, i);

        // -1 artinya tidak ketemu: tambahkan sisa teks lalu berhenti
        if (j === -1) {
            out += esc(s.slice(i));
            break;
        }

        // Teks sebelum kata yang cocok (biasa)
        out += esc(s.slice(i, j));
        // Kata yang cocok dibungkus <mark> agar berwarna kuning
        out += "<mark>" + esc(s.slice(j, j + keyword.length)) + "</mark>";
        // Pindahkan posisi ke setelah kata yang cocok
        i = j + keyword.length;
    }

    return out;
}

// ============================================================
// VALIDASI DEADLINE
// ============================================================

// Menghasilkan tanggal hari ini dengan format YYYY-MM-DD
function getToday() {
    const now = new Date(); // tanggal & waktu sekarang

    const year = now.getFullYear();                              // tahun
    // getMonth() mulai dari 0 (Januari = 0), jadi ditambah 1.
    // padStart(2, "0") menambah angka 0 di depan, contoh 5 -> "05"
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");          // tanggal

    return `${year}-${month}-${day}`;
}

// Mengatur batas minimal pada kolom tanggal agar tidak bisa memilih tanggal lampau
function updateDeadline() {
    const due = $("due");

    if (due) {
        due.min = getToday(); // atribut min = tanggal paling awal yang boleh dipilih
    }
}

// Jalankan sekali saat halaman dibuka
updateDeadline();

// Perbarui batas tanggal setiap kali kolom tanggal disentuh
// (berguna jika halaman dibiarkan terbuka sampai berganti hari)
$("due").addEventListener("focus", updateDeadline);
$("due").addEventListener("click", updateDeadline);

// Tugas terlambat = belum selesai DAN deadline sebelum hari ini.
// Membandingkan teks YYYY-MM-DD bisa dilakukan karena urutannya sama dengan urutan tanggal.
function isLate(t) {
    return !t.is_done && t.due_date && t.due_date < getToday();
}

// ============================================================
// PESAN ERROR / INFORMASI
// ============================================================

// Menampilkan pesan di kotak tertentu (id), lalu menyembunyikannya setelah 6 detik
function showErr(msg, id = "err") { // id = "err" adalah nilai bawaan
    const e = $(id);

    if (!e) return; // jika elemen tidak ada, hentikan

    e.textContent = msg;        // isi pesan
    e.style.display = "block";  // tampilkan kotak

    // Batalkan timer lama agar tidak bertabrakan jika pesan muncul berulang
    clearTimeout(e._t);

    // Sembunyikan kotak setelah 6000 ms (6 detik)
    e._t = setTimeout(() => {
        e.style.display = "none";
    }, 6000);
}

// Mengubah titik dan teks status koneksi
function setStatus(ok, text) {
    // ok = true: hijau; ok = false: tambah class "off" (merah muda)
    $("dot").className = "dot" + (ok ? "" : " off");
    $("stat").textContent = text;
}

// Menerjemahkan pesan error bawaan Supabase ke bahasa Indonesia.
// /.../i adalah regular expression; huruf i = tidak membedakan huruf besar/kecil
function trErr(m = "") {
    if (/invalid login/i.test(m))
        return "Email atau password salah.";

    if (/already registered/i.test(m))
        return "Email ini sudah terdaftar. Pilih tab Masuk.";

    if (/at least 6|weak/i.test(m))
        return "Password minimal 6 karakter.";

    if (/rate limit/i.test(m))
        return "Terlalu banyak percobaan. Tunggu sebentar.";

    if (/valid email|invalid format/i.test(m))
        return "Format email tidak valid.";

    return m; // pesan lain ditampilkan apa adanya
}

// ============================================================
// PENYIMPANAN LOKAL (localStorage di browser)
// ============================================================

const local = {
    // Mengambil data tugas dari browser
    get() {
        try {
            // getItem mengembalikan teks JSON; JSON.parse mengubahnya jadi array
            return JSON.parse(
                localStorage.getItem("todos") || "[]"
            );
        } catch {
            // Jika data rusak, kembalikan array kosong
            return [];
        }
    },

    // Menyimpan data tugas ke browser
    set(v) {
        try {
            // JSON.stringify mengubah array menjadi teks agar bisa disimpan
            localStorage.setItem("todos", JSON.stringify(v));
        } catch {
            showErr("Gagal menyimpan data di browser.");
        }
    }
};

// ============================================================
// TAMPILAN LOGIN
// ============================================================

// Mengatur bagian halaman mana yang tampil.
// loggedIn = true  -> tampilkan aplikasi; false -> tampilkan form login
function view(loggedIn, email) {
    // toggle("hidden", kondisi): jika kondisi true, class hidden dipasang (disembunyikan)
    $("auth").classList.toggle("hidden", loggedIn);
    $("app").classList.toggle("hidden", !loggedIn);
    $("prog").classList.toggle("hidden", !loggedIn);

    // Kotak email + tombol Keluar hanya tampil jika sudah login dan memakai Supabase
    $("whobox").classList.toggle(
        "hidden",
        !(loggedIn && sb)
    );

    // Tulis "Masuk sebagai ..." jika email tersedia
    $("who").textContent = email
        ? "Masuk sebagai " + email
        : "";

    // Jika belum login / baru logout: kosongkan data dan reset pencarian
    if (!loggedIn) {
        todos = [];

        keyword = "";
        $("search").value = "";
        $("clear-search").classList.add("hidden");

        render();
        setStatus(true, "Silakan masuk atau daftar");
    }
}

// ============================================================
// MEMUAT DATA (READ)
// ============================================================

// async = fungsi yang boleh menunggu proses lama dengan await
async function load() {
    // Mode lokal: ambil dari localStorage
    if (!sb) {
        todos = local.get();

        setStatus(
            false,
            "Mode lokal (Supabase belum diisi)"
        );

        return render();
    }

    // Mode Supabase: ambil semua kolom dari tabel "todos",
    // diurutkan dari yang terbaru (created_at menurun)
    const { data, error } = await sb
        .from("todos")
        .select("*")
        .order("created_at", { ascending: false });

    // Jika terjadi error
    if (error) {
        // Token login (JWT) kedaluwarsa -> keluarkan pengguna
        if (/jwt/i.test(error.message)) {
            await sb.auth.signOut();
            return view(false);
        }

        setStatus(false, "Gagal terhubung ke Supabase");

        return showErr(
            "Gagal memuat data: " + error.message
        );
    }

    // Simpan data ke variabel todos (jika kosong pakai array kosong)
    todos = data || [];

    setStatus(true, "Tersimpan di Supabase");

    render(); // gambar ulang tampilan
}

// ============================================================
// TAMBAH TUGAS (CREATE)
// ============================================================

async function add(title, note, priority, due) {
    // Validasi ulang deadline (lapisan keamanan kedua)
    if (!due || due < getToday()) {
        return showErr(
            "Deadline harus hari ini atau tanggal setelahnya."
        );
    }

    // Objek tugas baru (nama kunci = nama kolom di database)
    const newTask = {
        title,
        note,
        priority,
        due_date: due,
        is_done: false // tugas baru belum selesai
    };

    // Mode lokal
    if (!sb) {
        // unshift = masukkan ke urutan paling depan.
        // Date.now() = angka waktu sekarang, dipakai sebagai id unik.
        // ...newTask = menyalin semua isi newTask ke objek ini
        todos.unshift({
            id: Date.now(),
            ...newTask
        });

        local.set(todos); // simpan ke browser
        return render();
    }

    // Mode Supabase: insert = tambah baris baru.
    // select().single() = minta data yang baru dibuat (lengkap dengan id)
    const { data, error } = await sb
        .from("todos")
        .insert(newTask)
        .select()
        .single();

    if (error) {
        return showErr(
            "Gagal menambah tugas: " + error.message
        );
    }

    todos.unshift(data); // masukkan ke daftar paling atas
    render();
}

// ============================================================
// EDIT TUGAS YANG SUDAH ADA (UPDATE)
// ============================================================

async function editTask(id) {
    // Cari tugas berdasarkan id (dibandingkan sebagai teks agar aman)
    const task = todos.find(
        t => String(t.id) === String(id)
    );

    if (!task) return; // tidak ditemukan -> berhenti

    // Tugas yang deadline-nya sudah lewat tidak bisa diedit
    if (isLate(task)) {
        return showErr("Deadline tugas ini sudah lewat.");
    }

    // prompt() menampilkan kotak input; parameter kedua = isi awal.
    // Hasilnya null jika pengguna menekan Batal.

    // Edit judul
    const title = prompt(
        "EDIT JUDUL TUGAS",
        task.title
    );

    if (title === null) return; // dibatalkan

    if (!title.trim()) { // trim() menghapus spasi di awal/akhir
        return showErr("Judul tidak boleh kosong.");
    }

    // Edit catatan
    const note = prompt(
        "EDIT CATATAN TUGAS",
        task.note || ""
    );

    if (note === null) return;

    // Edit prioritas
    const priority = prompt(
        "EDIT PRIORITAS (tinggi / sedang / rendah)",
        task.priority
    );

    if (priority === null) return;

    // Prioritas harus salah satu dari tiga nilai yang diizinkan
    if (!["tinggi", "sedang", "rendah"].includes(priority)) {
        return showErr(
            "Prioritas harus tinggi, sedang, atau rendah."
        );
    }

    // Edit deadline
    const due = prompt(
        "EDIT DEADLINE (YYYY-MM-DD)",
        task.due_date || ""
    );

    if (due === null) return;

    // Regex ^\d{4}-\d{2}-\d{2}$ = 4 angka-2 angka-2 angka (format tanggal)
    if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
        return showErr("Format tanggal tidak valid.");
    }

    // Tanggal tidak boleh sebelum hari ini
    if (due < getToday()) {
        return showErr(
            "Deadline tidak boleh menggunakan tanggal lampau."
        );
    }

    // Data baru yang akan disimpan
    const updated = {
        title: title.trim(),
        note: note.trim(),
        priority,
        due_date: due
    };

    // Mode lokal
    if (!sb) {
        // Object.assign menyalin isi "updated" ke objek task (menimpa nilai lama)
        Object.assign(task, updated);

        local.set(todos);

        return render();
    }

    // Mode Supabase: update data lama (bukan membuat tugas baru).
    // .eq("id", id) = hanya baris yang id-nya sama
    const { data, error } = await sb
        .from("todos")
        .update(updated)
        .eq("id", id)
        .select()
        .single();

    if (error) {
        return showErr(
            "Gagal mengedit tugas: " + error.message
        );
    }

    Object.assign(task, data); // sinkronkan dengan data dari database

    render();

    showErr("Perubahan tugas berhasil disimpan!", "err");
}

// ============================================================
// TANDAI SELESAI / BELUM SELESAI
// ============================================================

async function toggle(id) {
    const task = todos.find(
        t => String(t.id) === String(id)
    );

    if (!task) return;

    // Tugas yang deadline-nya sudah lewat tidak bisa dicentang
    if (isLate(task)) {
        return showErr("Deadline tugas ini sudah lewat.");
    }

    const oldStatus = task.is_done; // simpan status lama untuk berjaga-jaga

    task.is_done = !oldStatus;      // balik status (true <-> false)

    // "Optimistic update": tampilan diubah dulu agar terasa cepat
    render();

    if (!sb) {
        return local.set(todos);
    }

    // Kirim perubahan ke database
    const { error } = await sb
        .from("todos")
        .update({
            is_done: task.is_done
        })
        .eq("id", id);

    // Jika gagal, kembalikan status seperti semula
    if (error) {
        task.is_done = oldStatus;

        render();

        showErr(
            "Gagal mengubah status: " + error.message
        );
    }
}

// ============================================================
// HAPUS TUGAS (DELETE)
// ============================================================

async function remove(id) {
    const old = [...todos]; // salinan daftar lama untuk cadangan

    // filter() membuat daftar baru tanpa tugas yang dihapus
    todos = todos.filter(
        t => String(t.id) !== String(id)
    );

    render(); // tampilan langsung diperbarui

    if (!sb) {
        return local.set(todos);
    }

    // Hapus baris di database
    const { error } = await sb
        .from("todos")
        .delete()
        .eq("id", id);

    // Jika gagal, kembalikan daftar dari cadangan
    if (error) {
        todos = old;

        render();

        showErr(
            "Gagal menghapus tugas: " + error.message
        );
    }
}

// ============================================================
// FORMAT TANGGAL
// ============================================================

// Mengubah "2026-11-23" menjadi format Indonesia, contoh "23 Nov 2026"
function fmt(d) {
    if (!d) return "Tanpa deadline";

    // Ditambah "T00:00:00" agar tanggal dibaca sebagai waktu lokal
    return new Date(d + "T00:00:00").toLocaleDateString(
        "id-ID",
        {
            day: "numeric",
            month: "short",
            year: "numeric"
        }
    );
}

// ============================================================
// RENDER: MENGGAMBAR ULANG DAFTAR TUGAS
// ============================================================

function render() {
    // Hitung jumlah tugas selesai dan total tugas
    const done = todos.filter(t => t.is_done).length;
    const total = todos.length;

    // Persentase selesai (dibulatkan); jika total 0 hasilnya 0 (hindari bagi nol)
    const pct = total
        ? Math.round(done / total * 100)
        : 0;

    // Tampilkan persentase dan teks progres
    $("pct").textContent = pct + "%";

    $("cnt").textContent =
        `${done} dari ${total} selesai`;

    // Isi lingkaran progres: 502 = kosong, 0 = penuh
    $("bar").style.strokeDashoffset =
        502 - (502 * pct / 100);

    // Isi angka pada tab filter
    $("c-all").textContent = total;
    $("c-done").textContent = done;
    $("c-open").textContent = total - done;

    // Tugas yang ditampilkan = lolos filter tab DAN cocok dengan pencarian
    const shown = todos.filter(t =>
        (
            filter === "all" ||
            (filter === "done" ? t.is_done : !t.is_done)
        ) && matchSearch(t)
    );

    // Jika ada tugas: buat HTML untuk tiap tugas (map) lalu gabungkan (join).
    // Jika tidak ada: tampilkan pesan kosong.
    $("list").innerHTML = shown.length
        ? shown.map(t => `
            <!-- class mengikuti prioritas, status selesai, dan status terlambat -->
            <li class="${esc(t.priority)} ${t.is_done ? "done" : ""} ${isLate(t) ? "late" : ""}">

                <!-- Tombol centang; data-a = aksi, data-id = id tugas.
                     disabled jika tugas terlambat -->
                <button
                    class="chk"
                    data-a="toggle"
                    data-id="${esc(t.id)}"
                    aria-label="Tandai selesai"
                    type="button"
                    ${isLate(t) ? "disabled" : ""}
                >✓</button>

                <div class="task-content">

                    <!-- Judul tugas (dengan stabilo pencarian) -->
                    <div class="t">
                        ${hl(t.title)}
                    </div>

                    <!-- Info: deadline, prioritas, dan penanda terlambat -->
                    <div class="m">
                        ${fmt(t.due_date)}
                        · ${esc(t.priority)}
                        ${isLate(t) ? " · ⚠️ Terlambat" : ""}
                    </div>

                    <!-- Catatan hanya ditampilkan jika ada isinya -->
                    ${t.note ? `
                        <div class="task-note">
                            ${hl(t.note)}
                        </div>
                    ` : ""}

                </div>

                <!-- Tombol edit -->
                <button
                    class="edit"
                    data-a="edit"
                    data-id="${esc(t.id)}"
                    aria-label="Edit tugas"
                    type="button"
                    ${isLate(t) ? "disabled" : ""}
                >✏️</button>

                <!-- Tombol hapus -->
                <button
                    class="del"
                    data-a="del"
                    data-id="${esc(t.id)}"
                    aria-label="Hapus tugas"
                    type="button"
                >✕</button>

            </li>
        `).join("")

        : `
            <!-- Tampilan saat tidak ada tugas yang cocok -->
            <li class="kosong">
                <div class="empty">
                    <b>
                        ${keyword
                            ? "Tugas tidak ditemukan"
                            : total
                                ? "Tidak ada tugas di sini"
                                : "Belum ada tugas"
                        }
                    </b>

                    ${keyword
                        ? "Coba kata kunci lain atau hapus pencarian."
                        : total
                            ? "Coba pilih filter lain."
                            : "Tulis tugas pertamamu di atas."
                    }
                </div>
            </li>
        `;
}

// ============================================================
// EVENT: FORM TAMBAH TUGAS
// ============================================================

// Dijalankan saat form tambah tugas dikirim (tombol + Tambah ditekan)
$("f").addEventListener("submit", async e => {
    e.preventDefault(); // cegah halaman reload otomatis

    updateDeadline();

    // Ambil nilai dari setiap kolom
    const title = $("title").value.trim();
    const note = $("note").value.trim();
    const priority = $("prio").value;
    const due = $("due").value;

    // Validasi
    if (!title) {
        return showErr("Masukkan judul tugas.");
    }

    if (!due || due < getToday()) {
        return showErr(
            "Pilih deadline hari ini atau tanggal setelahnya."
        );
    }

    const btn = $("f").querySelector('button[type="submit"]');

    btn.disabled = true; // nonaktifkan tombol agar tidak terkirim dua kali

    try {
        await add(title, note, priority, due);

        // Jika tugas benar-benar masuk daftar, kosongkan form
        if (todos.some(t => t.title === title)) {
            $("title").value = "";
            $("note").value = "";
            $("due").value = "";
            $("title").focus(); // kursor kembali ke kolom judul
        }
    } finally {
        btn.disabled = false; // finally selalu dijalankan, tombol aktif lagi
    }
});

// ============================================================
// EVENT: PENCARIAN
// ============================================================

// Event "input" aktif setiap kali pengguna mengetik / menghapus huruf
$("search").addEventListener("input", e => {
    // Ambil teks, buang spasi pinggir, ubah ke huruf kecil
    keyword = e.target.value.trim().toLowerCase();

    // Tampilkan tombol ✕ hanya jika ada kata kunci
    $("clear-search").classList.toggle("hidden", !keyword);

    render(); // gambar ulang daftar sesuai hasil pencarian
});

// Tombol ✕: kosongkan pencarian
$("clear-search").addEventListener("click", () => {
    keyword = "";
    $("search").value = "";
    $("clear-search").classList.add("hidden");
    $("search").focus();

    render();
});

// ============================================================
// EVENT: KLIK PADA DAFTAR TUGAS
// ============================================================

// Event delegation: satu listener di <ul> untuk menangani semua tombol di dalamnya.
// Cara ini dipakai karena isi daftar sering dibuat ulang.
$("list").addEventListener("click", e => {
    // closest("button") = cari tombol terdekat dari elemen yang diklik
    const b = e.target.closest("button");

    // Abaikan jika bukan tombol atau tombolnya nonaktif
    if (!b || b.disabled) return;

    const id = b.dataset.id; // membaca atribut data-id

    // data-a menentukan aksi yang dijalankan
    if (b.dataset.a === "toggle") {
        toggle(id);
    } else if (b.dataset.a === "edit") {
        editTask(id);
    } else if (b.dataset.a === "del") {
        // Konfirmasi dulu sebelum menghapus
        if (confirm("Anda yakin ingin menghapus tugas ini?")) {
            remove(id);
        }
    }
});

// ============================================================
// EVENT: FILTER TUGAS (Semua / Belum selesai / Selesai)
// ============================================================

$("tabs").addEventListener("click", e => {
    const b = e.target.closest(".tab");

    if (!b) return;

    // Hapus class "on" dari semua tab
    document.querySelectorAll("#tabs .tab")
        .forEach(x => x.classList.remove("on"));

    // Beri class "on" pada tab yang diklik
    b.classList.add("on");

    filter = b.dataset.f; // simpan filter: all / open / done

    render();
});

// ============================================================
// EVENT: PINDAH TAB MASUK / DAFTAR
// ============================================================

$("atabs").addEventListener("click", e => {
    const b = e.target.closest(".atab");

    if (!b) return;

    document.querySelectorAll(".atab")
        .forEach(x => x.classList.remove("on"));

    b.classList.add("on");

    mode = b.dataset.m; // "masuk" atau "daftar"

    // Ubah tulisan tombol sesuai mode
    $("asubmit").textContent =
        mode === "masuk" ? "Masuk" : "Buat akun";

    // Ubah petunjuk autofill password browser
    $("pw").autocomplete =
        mode === "masuk"
            ? "current-password"
            : "new-password";

    // Ubah teks petunjuk di bawah form
    $("anote").textContent =
        mode === "masuk"
            ? "Belum punya akun? Pilih tab Daftar. Setiap akun punya daftar tugas sendiri."
            : "Daftar cukup dengan email dan password. Kamu langsung masuk setelah akun dibuat.";
});

// ============================================================
// EVENT: PROSES LOGIN / DAFTAR
// ============================================================

$("af").addEventListener("submit", async e => {
    e.preventDefault();

    // Jika Supabase belum dikonfigurasi, login tidak bisa dipakai
    if (!sb) {
        return showErr(
            "Supabase belum dikonfigurasi.",
            "aerr"
        );
    }

    const email = $("email").value.trim();
    const password = $("pw").value;
    const btn = $("asubmit");

    btn.disabled = true;

    // try...catch...finally = coba jalankan, tangkap error, lalu bersihkan
    try {
        // Mode masuk -> signInWithPassword; mode daftar -> signUp
        const res = mode === "masuk"
            ? await sb.auth.signInWithPassword({
                email,
                password
            })
            : await sb.auth.signUp({
                email,
                password
            });

        // Jika ada error dari Supabase, tampilkan dalam bahasa Indonesia
        if (res.error) {
            return showErr(
                trErr(res.error.message),
                "aerr"
            );
        }

        // Jika tidak ada sesi, berarti akun perlu konfirmasi email dulu
        if (!res.data.session) {
            return showErr(
                "Akun dibuat, tetapi perlu konfirmasi email. Cek emailmu atau pengaturan Confirm email di Supabase.",
                "aerr"
            );
        }

        $("pw").value = ""; // kosongkan password demi keamanan

        view(true, res.data.user.email); // tampilkan aplikasi

        await load(); // muat tugas milik pengguna

    } catch (error) {
        showErr(error.message, "aerr");
    } finally {
        btn.disabled = false;
    }
});

// ============================================================
// EVENT: LOGOUT (dengan konfirmasi)
// ============================================================

$("logout").addEventListener("click", async () => {
    // confirm() menampilkan kotak Ya/Batal; jika Batal, berhenti
    if (!confirm("Anda yakin ingin keluar dari halaman ini?")) return;

    if (sb) {
        await sb.auth.signOut(); // keluar dari akun Supabase
    }

    view(false); // kembali ke form login
});

// ============================================================
// MULAI APLIKASI
// ============================================================

// Fungsi yang langsung dijalankan saat halaman dibuka (IIFE)
(async () => {
    // Tampilkan tanggal hari ini pada stiker, contoh "Senin, 23 November"
    $("today").textContent = new Date().toLocaleDateString(
        "id-ID",
        {
            weekday: "long",
            day: "numeric",
            month: "long"
        }
    );

    // Tanpa Supabase: langsung masuk mode lokal
    if (!sb) {
        view(true);
        return load();
    }

    // Cek apakah pengguna masih punya sesi login
    const { data, error } = await sb.auth.getSession();

    if (error) {
        return showErr(error.message);
    }

    if (data.session) {
        // Sudah login: tampilkan aplikasi dan muat data
        view(true, data.session.user.email);
        await load();
    } else {
        // Belum login: tampilkan form login
        view(false);
    }
})();