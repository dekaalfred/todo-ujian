
const ready =
    !SUPABASE_URL.includes("ISI_") &&
    !SUPABASE_KEY.includes("ISI_");

const sb = ready
    ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

let todos = [];
let filter = "all";
let mode = "masuk";

const $ = id => document.getElementById(id);

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
}[c]));

// ===============================
// VALIDASI DEADLINE
// ===============================

function getToday() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function updateDeadline() {
    const due = $("due");

    if (due) {
        due.min = getToday();
    }
}

updateDeadline();

// ===============================
// PESAN ERROR
// ===============================

function showErr(msg, id = "err") {
    const e = $(id);

    if (!e) return;

    e.textContent = msg;
    e.style.display = "block";

    clearTimeout(e._t);

    e._t = setTimeout(() => {
        e.style.display = "none";
    }, 6000);
}

function setStatus(ok, text) {
    $("dot").className = "dot" + (ok ? "" : " off");
    $("stat").textContent = text;
}

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

    return m;
}

// ===============================
// PENYIMPANAN LOKAL
// ===============================

const local = {
    get() {
        try {
            return JSON.parse(
                localStorage.getItem("todos") || "[]"
            );
        } catch {
            return [];
        }
    },

    set(v) {
        try {
            localStorage.setItem("todos", JSON.stringify(v));
        } catch {
            showErr("Gagal menyimpan data di browser.");
        }
    }
};

// ===============================
// TAMPILAN LOGIN
// ===============================

function view(loggedIn, email) {
    $("auth").classList.toggle("hidden", loggedIn);
    $("app").classList.toggle("hidden", !loggedIn);
    $("prog").classList.toggle("hidden", !loggedIn);

    $("whobox").classList.toggle(
        "hidden",
        !(loggedIn && sb)
    );

    $("who").textContent = email
        ? "Masuk sebagai " + email
        : "";

    if (!loggedIn) {
        todos = [];
        render();
        setStatus(true, "Silakan masuk atau daftar");
    }
}

// ===============================
// MEMUAT DATA
// ===============================

async function load() {
    if (!sb) {
        todos = local.get();

        setStatus(
            false,
            "Mode lokal (Supabase belum diisi)"
        );

        return render();
    }

    const { data, error } = await sb
        .from("todos")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        if (/jwt/i.test(error.message)) {
            await sb.auth.signOut();
            return view(false);
        }

        setStatus(false, "Gagal terhubung ke Supabase");

        return showErr(
            "Gagal memuat data: " + error.message
        );
    }

    todos = data || [];

    setStatus(true, "Tersimpan di Supabase");

    render();
}

// ===============================
// TAMBAH TUGAS
// ===============================

async function add(title, note, priority, due) {
    if (!due || due < getToday()) {
        return showErr(
            "Deadline harus hari ini atau tanggal setelahnya."
        );
    }

    const newTask = {
        title,
        note,
        priority,
        due_date: due,
        is_done: false
    };

    if (!sb) {
        todos.unshift({
            id: Date.now(),
            ...newTask
        });

        local.set(todos);
        return render();
    }

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

    todos.unshift(data);
    render();
}

// ===============================
// EDIT TUGAS YANG SUDAH ADA
// ===============================

async function editTask(id) {
    const task = todos.find(
        t => String(t.id) === String(id)
    );

    if (!task) return;

    // Edit judul
    const title = prompt(
        "EDIT JUDUL TUGAS",
        task.title
    );

    if (title === null) return;

    if (!title.trim()) {
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

    if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
        return showErr("Format tanggal tidak valid.");
    }

    if (due < getToday()) {
        return showErr(
            "Deadline tidak boleh menggunakan tanggal lampau."
        );
    }

    const updated = {
        title: title.trim(),
        note: note.trim(),
        priority,
        due_date: due
    };

    if (!sb) {
        Object.assign(task, updated);

        local.set(todos);

        return render();
    }

    // Update data lama, bukan membuat tugas baru
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

    Object.assign(task, data);

    render();

    showErr("Perubahan tugas berhasil disimpan!", "err");
}

// ===============================
// TANDAI SELESAI
// ===============================

async function toggle(id) {
    const task = todos.find(
        t => String(t.id) === String(id)
    );

    if (!task) return;

    const oldStatus = task.is_done;

    task.is_done = !oldStatus;

    render();

    if (!sb) {
        return local.set(todos);
    }

    const { error } = await sb
        .from("todos")
        .update({
            is_done: task.is_done
        })
        .eq("id", id);

    if (error) {
        task.is_done = oldStatus;

        render();

        showErr(
            "Gagal mengubah status: " + error.message
        );
    }
}

// ===============================
// HAPUS TUGAS
// ===============================

async function remove(id) {
    const old = [...todos];

    todos = todos.filter(
        t => String(t.id) !== String(id)
    );

    render();

    if (!sb) {
        return local.set(todos);
    }

    const { error } = await sb
        .from("todos")
        .delete()
        .eq("id", id);

    if (error) {
        todos = old;

        render();

        showErr(
            "Gagal menghapus tugas: " + error.message
        );
    }
}

// ===============================
// FORMAT TANGGAL
// ===============================

function fmt(d) {
    if (!d) return "Tanpa deadline";

    return new Date(d + "T00:00:00").toLocaleDateString(
        "id-ID",
        {
            day: "numeric",
            month: "short",
            year: "numeric"
        }
    );
}

// ===============================
// RENDER DAFTAR TUGAS
// ===============================

function render() {
    const done = todos.filter(t => t.is_done).length;
    const total = todos.length;

    const pct = total
        ? Math.round(done / total * 100)
        : 0;

    $("pct").textContent = pct + "%";

    $("cnt").textContent =
        `${done} dari ${total} selesai`;

    $("bar").style.strokeDashoffset =
        502 - (502 * pct / 100);

    $("c-all").textContent = total;
    $("c-done").textContent = done;
    $("c-open").textContent = total - done;

    const shown = todos.filter(t =>
        filter === "all" ||
        (filter === "done" ? t.is_done : !t.is_done)
    );

    $("list").innerHTML = shown.length
        ? shown.map(t => `
            <li class="${esc(t.priority)} ${t.is_done ? "done" : ""}">

                <button
                    class="chk"
                    data-a="toggle"
                    data-id="${esc(t.id)}"
                    aria-label="Tandai selesai"
                >✓</button>

                <div class="task-content">

                    <div class="t">
                        ${esc(t.title)}
                    </div>

                    <div class="m">
                        ${fmt(t.due_date)}
                        · ${esc(t.priority)}
                    </div>

                    ${t.note ? `
                        <div class="task-note">
                            ${esc(t.note)}
                        </div>
                    ` : ""}

                </div>

                <button
                    class="edit"
                    data-a="edit"
                    data-id="${esc(t.id)}"
                    aria-label="Edit tugas"
                    type="button"
                >✏️</button>

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
            <li class="kosong">
                <div class="empty">
                    <b>
                        ${total
                            ? "Tidak ada tugas di sini"
                            : "Belum ada tugas"
                        }
                    </b>

                    ${total
                        ? "Coba pilih filter lain."
                        : "Tulis tugas pertamamu di atas."
                    }
                </div>
            </li>
        `;
}

// ===============================
// FORM TAMBAH TUGAS
// ===============================

$("f").addEventListener("submit", async e => {
    e.preventDefault();

    updateDeadline();

    const title = $("title").value.trim();
    const note = $("note").value.trim();
    const priority = $("prio").value;
    const due = $("due").value;

    if (!title) {
        return showErr("Masukkan judul tugas.");
    }

    if (!due || due < getToday()) {
        return showErr(
            "Pilih deadline hari ini atau tanggal setelahnya."
        );
    }

    const btn = $("f").querySelector('button[type="submit"]');

    btn.disabled = true;

    try {
        await add(title, note, priority, due);

        if (todos.some(t => t.title === title)) {
            $("title").value = "";
            $("note").value = "";
            $("due").value = "";
            $("title").focus();
        }
    } finally {
        btn.disabled = false;
    }
});

// ===============================
// EVENT DAFTAR TUGAS
// ===============================

$("list").addEventListener("click", e => {
    const b = e.target.closest("button");

    if (!b) return;

    const id = b.dataset.id;

    if (b.dataset.a === "toggle") {
        toggle(id);
    } else if (b.dataset.a === "edit") {
        editTask(id);
    } else if (b.dataset.a === "del") {
        remove(id);
    }
});

// ===============================
// FILTER TUGAS
// ===============================

$("tabs").addEventListener("click", e => {
    const b = e.target.closest(".tab");

    if (!b) return;

    document.querySelectorAll("#tabs .tab")
        .forEach(x => x.classList.remove("on"));

    b.classList.add("on");

    filter = b.dataset.f;

    render();
});

// ===============================
// LOGIN DAN DAFTAR
// ===============================

$("atabs").addEventListener("click", e => {
    const b = e.target.closest(".atab");

    if (!b) return;

    document.querySelectorAll(".atab")
        .forEach(x => x.classList.remove("on"));

    b.classList.add("on");

    mode = b.dataset.m;

    $("asubmit").textContent =
        mode === "masuk" ? "Masuk" : "Buat akun";

    $("pw").autocomplete =
        mode === "masuk"
            ? "current-password"
            : "new-password";

    $("anote").textContent =
        mode === "masuk"
            ? "Belum punya akun? Pilih tab Daftar. Setiap akun punya daftar tugas sendiri."
            : "Daftar cukup dengan email dan password. Kamu langsung masuk setelah akun dibuat.";
});

// ===============================
// PROSES LOGIN
// ===============================

$("af").addEventListener("submit", async e => {
    e.preventDefault();

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

    try {
        const res = mode === "masuk"
            ? await sb.auth.signInWithPassword({
                email,
                password
            })
            : await sb.auth.signUp({
                email,
                password
            });

        if (res.error) {
            return showErr(
                trErr(res.error.message),
                "aerr"
            );
        }

        if (!res.data.session) {
            return showErr(
                "Akun dibuat, tetapi perlu konfirmasi email. Cek emailmu atau pengaturan Confirm email di Supabase.",
                "aerr"
            );
        }

        $("pw").value = "";

        view(true, res.data.user.email);

        await load();

    } catch (error) {
        showErr(error.message, "aerr");
    } finally {
        btn.disabled = false;
    }
});

// ===============================
// LOGOUT
// ===============================

$("logout").addEventListener("click", async () => {
    if (sb) {
        await sb.auth.signOut();
    }

    view(false);
});

// ===============================
// MULAI APLIKASI
// ===============================

(async () => {
    $("today").textContent = new Date().toLocaleDateString(
        "id-ID",
        {
            weekday: "long",
            day: "numeric",
            month: "long"
        }
    );

    if (!sb) {
        view(true);
        return load();
    }

    const { data, error } = await sb.auth.getSession();

    if (error) {
        return showErr(error.message);
    }

    if (data.session) {
        view(true, data.session.user.email);
        await load();
    } else {
        view(false);
    }
})();
