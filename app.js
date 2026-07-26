/* Хотелки — общий список на двоих. Офлайн-first, синхронизация через GitHub Gist. */
"use strict";

/* ---------- утилиты ---------- */
const $ = s => document.querySelector(s);
const now = () => Date.now();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = o => JSON.parse(JSON.stringify(o));

const URL_RE = /(https?:\/\/[^\s]+)|(\bwww\.[^\s]+)/i;
function firstUrl(t) {
  const m = (t || "").match(URL_RE);
  if (!m) return null;
  let u = m[0].replace(/[),.;]+$/, "");
  if (/^www\./i.test(u)) u = "https://" + u;
  return u;
}
function domain(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}
function colorFor(name) {
  let h = 0; const s = (name || "?");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 62% 52%)`;
}
function initial(name) { return (name || "?").trim().slice(0, 1).toUpperCase() || "?"; }

/* ---------- хранилище ---------- */
const LS = {
  data: "hotelki.data.v1",
  cfg: "hotelki.cfg.v1"
};
const SYNC_FILE = "hotelki-data.json";
const SYNC_TAG = "#хотелки-sync";
const SYNC_DESC = "Хотелки — общий список (не удалять) " + SYNC_TAG;

function seedCategories() {
  const base = [
    ["🎁", "Вишлист / подарки"],
    ["✈️", "Поехать"],
    ["📍", "Сходить"],
    ["🍽️", "Кафе и рестораны"],
    ["🎬", "Кино и сериалы"],
    ["📚", "Книги"],
    ["🔗", "Ссылки"],
    ["💡", "Идеи и разное"]
  ];
  return base.map((c, i) => ({
    id: "c_" + i, em: c[0], title: c[1], order: i,
    inbox: i === base.length - 1, updatedAt: now(), deleted: false
  }));
}

let data = { version: 1, categories: [], items: [] };
let cfg = { me: "", token: "", gistId: "", theme: "auto", lastSync: 0 };
let view = "all";        // "all" | id категории
let syncState = "idle";  // idle | syncing | dirty | error
let pushTimer = null;

function load() {
  try { data = JSON.parse(localStorage.getItem(LS.data)) || data; } catch {}
  try { cfg = Object.assign(cfg, JSON.parse(localStorage.getItem(LS.cfg)) || {}); } catch {}
  if (!data.categories || !data.categories.length) data.categories = seedCategories();
  if (!data.items) data.items = [];
}
function saveData() { localStorage.setItem(LS.data, JSON.stringify(data)); }
function saveCfg() { localStorage.setItem(LS.cfg, JSON.stringify(cfg)); }

function inboxCat() {
  return data.categories.find(c => c.inbox && !c.deleted)
      || data.categories.find(c => !c.deleted)
      || data.categories[0];
}
function catById(id) { return data.categories.find(c => c.id === id); }
function liveCats() { return data.categories.filter(c => !c.deleted).sort((a, b) => a.order - b.order); }
function liveItems() { return data.items.filter(i => !i.deleted); }
function itemsOf(catId) { return liveItems().filter(i => i.cat === catId); }

/* ---------- тема ---------- */
function applyTheme() {
  const t = cfg.theme || "auto";
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}

/* ---------- рендер ---------- */
const ICON = {
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.9-10-9.2C.3 8.6 1.6 4.7 5.2 4.1c2-.3 3.8.8 4.8 2.3C11 4.9 12.8 3.8 14.8 4.1c3.6.6 4.9 4.5 3.2 7.7C19.5 16.1 12 21 12 21z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>'
};

function renderTopbar() {
  const who = cfg.me
    ? `<button class="who" id="whoBtn" style="background:${colorFor(cfg.me)}" title="${esc(cfg.me)}">${esc(initial(cfg.me))}</button>`
    : "";
  let dot = "";
  if (syncState === "dirty") dot = '<span class="dot dirty"></span>';
  else if (syncState === "error") dot = '<span class="dot err"></span>';
  $("#topbar").innerHTML = `
    <div class="brand">
      <div class="logo">${ICON.heart}</div>
      <div class="title">Хотелки</div>
    </div>
    ${who}
    <button class="icon-btn ${syncState === "syncing" ? "spin" : ""}" id="syncBtn" aria-label="Синхронизация">${ICON.sync}${dot}</button>
    <button class="icon-btn" id="settBtn" aria-label="Настройки">${ICON.gear}</button>`;
  $("#syncBtn").onclick = () => cfg.token && cfg.gistId ? syncNow(true) : openSettings();
  $("#settBtn").onclick = openSettings;
  const wb = $("#whoBtn"); if (wb) wb.onclick = openSettings;
}

function renderCats() {
  const cats = liveCats();
  const all = liveItems().length;
  let html = `<button class="chip ${view === "all" ? "cur" : ""}" data-cat="all">
      <span class="em">🗂️</span><span>Всё</span><span class="cnt">${all}</span></button>`;
  for (const c of cats) {
    const n = itemsOf(c.id).filter(i => !i.done).length;
    html += `<button class="chip ${view === c.id ? "cur" : ""}" data-cat="${c.id}">
        <span class="em">${c.em}</span><span>${esc(c.title)}</span>${n ? `<span class="cnt">${n}</span>` : ""}</button>`;
  }
  html += `<button class="chip add" id="addCatChip">＋ Тема</button>`;
  const el = $("#cats"); el.innerHTML = html;
  el.querySelectorAll(".chip[data-cat]").forEach(b => b.onclick = () => { view = b.dataset.cat; render(); });
  $("#addCatChip").onclick = () => editCategory(null);
}

function itemCard(it) {
  const c = catById(it.cat);
  const link = it.url ? `<span class="c-link" data-open="${esc(it.url)}">${ICON.link}<span>${esc(domain(it.url))}</span></span>` : "";
  const by = it.by ? `<span class="c-by"><span class="av" style="background:${colorFor(it.by)}">${esc(initial(it.by))}</span>${esc(it.by)}</span>` : "";
  const foot = (link || by) ? `<div class="c-foot">${link}${by}</div>` : "";
  return `<div class="card ${it.done ? "done" : ""}" data-id="${it.id}">
      <button class="check ${it.done ? "on" : ""}" data-toggle="${it.id}" aria-label="Отметить">${ICON.check}</button>
      <button class="c-main" data-edit="${it.id}">
        <div class="c-title">${esc(it.title)}</div>
        ${it.note ? `<div class="c-note">${esc(it.note)}</div>` : ""}
        ${foot}
      </button>
    </div>`;
}

function renderFeed() {
  const feed = $("#feed");
  const items = view === "all" ? liveItems() : itemsOf(view);
  if (!items.length) {
    const c = view === "all" ? null : catById(view);
    feed.innerHTML = `<div class="empty">
      <div class="mk">${c ? c.em : "🗂️"}</div>
      <h2>${c ? "Пока пусто в «" + esc(c.title) + "»" : "Пока ничего не хочется 😌"}</h2>
      <p>Впиши что-нибудь внизу или вставь ссылку — сохранится и появится у обоих после синхронизации.</p>
    </div>`;
    return;
  }
  let html = "";
  if (view === "all") {
    for (const c of liveCats()) {
      const its = itemsOf(c.id);
      if (!its.length) continue;
      its.sort(sortItems);
      html += `<div class="sec-h"><span class="t">${c.em} ${esc(c.title)}</span><span class="ln"></span></div>`;
      html += its.map(itemCard).join("");
    }
  } else {
    const active = items.filter(i => !i.done).sort(sortItems);
    const done = items.filter(i => i.done).sort(sortItems);
    html += active.map(itemCard).join("");
    if (done.length) {
      html += `<div class="sec-h"><span class="t">Сделано · ${done.length}</span><span class="ln"></span></div>`;
      html += done.map(itemCard).join("");
    }
  }
  feed.innerHTML = html;
  feed.querySelectorAll("[data-toggle]").forEach(b => b.onclick = e => { e.stopPropagation(); toggleDone(b.dataset.toggle); });
  feed.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => editItem(b.dataset.edit));
  feed.querySelectorAll("[data-open]").forEach(b => b.onclick = e => { e.stopPropagation(); window.open(b.dataset.open, "_blank", "noopener"); });
}
function sortItems(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }

function render() { renderTopbar(); renderCats(); renderFeed(); }

/* ---------- операции ---------- */
function addItem(title, url, catId, note) {
  const t = now();
  data.items.push({
    id: uid(), cat: catId, title: title.trim(), url: url || "", note: (note || "").trim(),
    done: false, by: cfg.me || "", createdAt: t, updatedAt: t, deleted: false
  });
  saveData(); markDirty(); render();
}
function updateItem(id, patch) {
  const it = data.items.find(i => i.id === id); if (!it) return;
  Object.assign(it, patch, { updatedAt: now() });
  saveData(); markDirty(); render();
}
function toggleDone(id) {
  const it = data.items.find(i => i.id === id); if (!it) return;
  updateItem(id, { done: !it.done });
}
function deleteItem(id) { updateItem(id, { deleted: true }); }

function quickAdd() {
  const inp = $("#input"); const raw = inp.value.trim();
  if (!raw) return;
  const url = firstUrl(raw);
  let title = raw;
  if (url) { title = raw.replace(url, "").replace(/^www\./, "").trim(); if (!title) title = domain(url); }
  const cat = view === "all" ? inboxCat().id : view;
  addItem(title, url, cat);
  inp.value = ""; autoGrow(inp); updateSendState();
  toast("Добавлено в «" + esc(catById(cat).title) + "»");
}

/* ---------- нижние шторки ---------- */
function openSheet(headHTML, bodyHTML) {
  $("#sheetHead").innerHTML = headHTML;
  $("#sheetBody").innerHTML = bodyHTML;
  $("#scrim").classList.add("show");
  $("#sheet").classList.add("show");
}
function closeSheet() {
  $("#scrim").classList.remove("show");
  $("#sheet").classList.remove("show");
}
$("#scrim").addEventListener("click", closeSheet);

function head(title, rightBtn) {
  return `<button class="txtbtn" id="sheetClose">Отмена</button><h2>${title}</h2>${rightBtn || '<span style="width:52px"></span>'}`;
}
function wireClose() { const b = $("#sheetClose"); if (b) b.onclick = closeSheet; }

/* добавить/редактировать элемент */
function itemForm(it) {
  const cats = liveCats();
  const curCat = it ? it.cat : (view === "all" ? inboxCat().id : view);
  return `
    <div class="field"><label>Что</label>
      <textarea class="input" id="fTitle" rows="2" placeholder="Например: сходить в новую кофейню">${esc(it ? it.title : "")}</textarea></div>
    <div class="field"><label>Ссылка (необязательно)</label>
      <input class="input" id="fUrl" inputmode="url" placeholder="https://…" value="${esc(it ? it.url : "")}"></div>
    <div class="field"><label>Заметка (необязательно)</label>
      <textarea class="input" id="fNote" rows="2" placeholder="Детали, цена, кто советовал…">${esc(it ? it.note : "")}</textarea></div>
    <div class="field"><label>Тема</label>
      <div class="picker" id="fCats">${cats.map(c => `<button class="pick ${c.id === curCat ? "cur" : ""}" data-c="${c.id}" style="font-size:14px;font-weight:650">${c.em} ${esc(c.title)}</button>`).join("")}</div></div>
    <div class="actions">
      <button class="btn primary" id="fSave">${it ? "Сохранить" : "Добавить"}</button>
      ${it ? '<button class="btn danger" id="fDel">Удалить</button>' : ""}
    </div>`;
}
function editItem(id) {
  const it = id ? data.items.find(i => i.id === id) : null;
  openSheet(head(it ? "Изменить" : "Новое"), itemForm(it));
  wireClose();
  let chosen = it ? it.cat : (view === "all" ? inboxCat().id : view);
  $("#fCats").querySelectorAll(".pick").forEach(b => b.onclick = () => {
    chosen = b.dataset.c;
    $("#fCats").querySelectorAll(".pick").forEach(x => x.classList.toggle("cur", x === b));
  });
  $("#fSave").onclick = () => {
    const title = $("#fTitle").value.trim();
    if (!title) { $("#fTitle").focus(); return; }
    let url = $("#fUrl").value.trim(); if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
    const note = $("#fNote").value.trim();
    if (it) updateItem(it.id, { title, url, note, cat: chosen });
    else addItem(title, url, chosen, note);
    closeSheet(); toast(it ? "Сохранено" : "Добавлено");
  };
  const del = $("#fDel"); if (del) del.onclick = () => { deleteItem(it.id); closeSheet(); toast("Удалено"); };
}

/* добавить/редактировать тему */
const EMOJI = ["🎁", "✈️", "📍", "🍽️", "🎬", "📚", "🔗", "💡", "🏠", "🛍️", "🎵", "🎮", "🏔️", "🌊", "🍷", "☕", "🐶", "🌱", "💪", "🎨", "🧩", "⭐", "❤️", "🔖"];
function editCategory(id) {
  const c = id ? catById(id) : null;
  let em = c ? c.em : "⭐";
  const body = `
    <div class="field"><label>Название</label>
      <input class="input" id="cTitle" placeholder="Например: Ремонт" value="${esc(c ? c.title : "")}"></div>
    <div class="field"><label>Значок</label>
      <div class="picker" id="cEmoji">${EMOJI.map(e => `<button class="pick ${e === em ? "cur" : ""}" data-e="${e}">${e}</button>`).join("")}</div></div>
    <div class="actions">
      <button class="btn primary" id="cSave">${c ? "Сохранить" : "Создать тему"}</button>
      ${c && !c.inbox ? '<button class="btn danger" id="cDel">Удалить тему</button>' : ""}
    </div>`;
  openSheet(head(c ? "Тема" : "Новая тема"), body);
  wireClose();
  $("#cEmoji").querySelectorAll(".pick").forEach(b => b.onclick = () => {
    em = b.dataset.e; $("#cEmoji").querySelectorAll(".pick").forEach(x => x.classList.toggle("cur", x === b));
  });
  $("#cSave").onclick = () => {
    const title = $("#cTitle").value.trim(); if (!title) { $("#cTitle").focus(); return; }
    if (c) { Object.assign(c, { title, em, updatedAt: now() }); }
    else {
      const order = Math.max(0, ...data.categories.map(x => x.order)) + 1;
      const nc = { id: uid(), em, title, order, inbox: false, updatedAt: now(), deleted: false };
      data.categories.push(nc); view = nc.id;
    }
    saveData(); markDirty(); render(); closeSheet(); toast(c ? "Сохранено" : "Тема создана");
  };
  const del = $("#cDel");
  if (del) del.onclick = () => {
    const cnt = itemsOf(c.id).length;
    if (cnt && !confirm(`В теме ${cnt} записей. Они тоже удалятся. Продолжить?`)) return;
    c.deleted = true; c.updatedAt = now();
    itemsOf(c.id).forEach(i => { i.deleted = true; i.updatedAt = now(); });
    if (view === c.id) view = "all";
    saveData(); markDirty(); render(); closeSheet(); toast("Тема удалена");
  };
}

/* ---------- настройки ---------- */
function openSettings() {
  const connected = cfg.token && cfg.gistId;
  const last = cfg.lastSync ? new Date(cfg.lastSync).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "ещё не было";
  const syncBox = connected
    ? `<div class="status"><span class="pip ${syncState === "error" ? "err" : "ok"}"></span>
         Подключено · синхронизация: ${last}</div>
       <div class="note-info">Общий гист: <b>${esc(cfg.gistId)}</b>. На втором телефоне открой настройки и вставь <b>тот же токен</b> — список найдётся сам.</div>
       <div class="actions">
         <button class="btn ghost" id="sSyncNow">Синхронизировать сейчас</button>
         <button class="btn ghost" id="sCopyId">Скопировать ID гиста</button>
         <button class="btn danger" id="sDisc">Отключить на этом устройстве</button>
       </div>`
    : `<div class="note-info">Чтобы список был общим и не терялся — подключи бесплатный <b>GitHub</b>. Нужен токен с доступом только к <b>gist</b>. Он хранится только на этом устройстве.</div>
       <div class="field"><label>GitHub-токен</label>
         <input class="input" id="sToken" placeholder="ghp_… или github_pat_…" autocomplete="off"></div>
       <div class="actions">
         <button class="btn primary" id="sConnect">Подключить</button>
         <button class="btn ghost" id="sHelp">Как получить токен?</button>
       </div>`;

  const body = `
    <div class="field"><label>Кто ты</label>
      <input class="input" id="sMe" placeholder="Имя (Антон / Диана)" value="${esc(cfg.me)}"></div>

    <div class="sec-h" style="margin:6px 4px 0"><span class="t">Синхронизация</span><span class="ln"></span></div>
    ${syncBox}

    <div class="sec-h" style="margin:12px 4px 0"><span class="t">Оформление</span><span class="ln"></span></div>
    <div class="seg" id="sTheme">
      <button data-t="auto" class="${cfg.theme === "auto" ? "cur" : ""}">Как в системе</button>
      <button data-t="light" class="${cfg.theme === "light" ? "cur" : ""}">Светлая</button>
      <button data-t="dark" class="${cfg.theme === "dark" ? "cur" : ""}">Тёмная</button>
    </div>

    <div class="note-info" style="margin-top:12px">Записей: <b>${liveItems().length}</b> · тем: <b>${liveCats().length}</b><br>Работает офлайн. Изменения синхронизируются, когда появляется сеть.</div>`;

  openSheet(`<button class="txtbtn" id="sheetClose">Готово</button><h2>Настройки</h2><span style="width:52px"></span>`, body);
  wireClose();

  $("#sMe").onblur = () => { cfg.me = $("#sMe").value.trim(); saveCfg(); renderTopbar(); };
  $("#sTheme").querySelectorAll("button").forEach(b => b.onclick = () => {
    cfg.theme = b.dataset.t; saveCfg(); applyTheme();
    $("#sTheme").querySelectorAll("button").forEach(x => x.classList.toggle("cur", x === b));
  });

  if (connected) {
    $("#sSyncNow").onclick = () => { closeSheet(); syncNow(true); };
    $("#sCopyId").onclick = () => { navigator.clipboard.writeText(cfg.gistId).then(() => toast("ID скопирован")); };
    $("#sDisc").onclick = () => {
      if (!confirm("Отключить синхронизацию на этом устройстве? Записи останутся локально.")) return;
      cfg.token = ""; cfg.gistId = ""; saveCfg(); setSync("idle"); openSettings(); toast("Отключено");
    };
  } else {
    $("#sConnect").onclick = () => {
      cfg.me = $("#sMe").value.trim();
      const tk = $("#sToken").value.trim();
      if (!tk) { $("#sToken").focus(); return; }
      connectGitHub(tk);
    };
    $("#sHelp").onclick = tokenHelp;
  }
}

function tokenHelp() {
  const body = `
    <div class="note-info" style="line-height:1.6">
      <b>Классический токен (проще):</b><br>
      1. Открой <b>github.com/settings/tokens</b> → Generate new token → <b>classic</b>.<br>
      2. Note: «Хотелки». Expiration: <b>No expiration</b>.<br>
      3. Отметь только галочку <b>gist</b>.<br>
      4. Generate token → скопируй строку <b>ghp_…</b> и вставь в поле выше.<br><br>
      <b>Важно:</b> оба телефона (твой и жены) используют <b>один и тот же токен</b> — тогда список общий. Второму просто вставить тот же токен, гист найдётся сам.
    </div>
    <div class="actions"><button class="btn primary" id="openGh">Открыть страницу токенов</button></div>`;
  openSheet(head("Как получить токен"), body);
  wireClose();
  $("#openGh").onclick = () => window.open("https://github.com/settings/tokens/new?description=%D0%A5%D0%BE%D1%82%D0%B5%D0%BB%D0%BA%D0%B8&scopes=gist", "_blank", "noopener");
}

/* ---------- GitHub Gist ---------- */
function gh(path, opts = {}) {
  return fetch("https://api.github.com" + path, Object.assign({
    headers: {
      "Authorization": "Bearer " + cfg.token,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  }, opts));
}

async function connectGitHub(token) {
  cfg.token = token; saveCfg();
  setSync("syncing"); toast("Проверяю токен…");
  try {
    // ищем существующий общий гист
    let found = null;
    const r = await gh("/gists?per_page=100");
    if (r.status === 401) throw new Error("Токен не подошёл. Проверь, что скопирован целиком и с доступом gist.");
    if (!r.ok) throw new Error("GitHub ответил ошибкой " + r.status);
    const list = await r.json();
    for (const g of list) {
      if ((g.files && g.files[SYNC_FILE]) || (g.description || "").includes(SYNC_TAG)) { found = g; break; }
    }
    if (found) {
      cfg.gistId = found.id; saveCfg();
      toast("Нашёл общий список");
      await syncNow(true, true);
    } else {
      const payload = { description: SYNC_DESC, public: false, files: { [SYNC_FILE]: { content: JSON.stringify(exportData()) } } };
      const cr = await gh("/gists", { method: "POST", body: JSON.stringify(payload) });
      if (!cr.ok) throw new Error("Не удалось создать гист (" + cr.status + ")");
      const g = await cr.json();
      cfg.gistId = g.id; cfg.lastSync = now(); saveCfg();
      setSync("idle"); toast("Хранилище создано ✓");
    }
    render();
    if ($("#sheet").classList.contains("show")) openSettings();
  } catch (e) {
    cfg.token = ""; saveCfg();
    setSync("error"); render();
    alert(e.message || "Не получилось подключиться");
  }
}

function exportData() { return { version: 1, categories: data.categories, items: data.items }; }

function mergeArr(local, remote) {
  const m = new Map();
  for (const x of remote || []) m.set(x.id, x);
  for (const x of local || []) {
    const ex = m.get(x.id);
    if (!ex || (x.updatedAt || 0) >= (ex.updatedAt || 0)) m.set(x.id, x);
  }
  return [...m.values()];
}
function pruneTombstones(arr) {
  const cutoff = now() - 60 * 864e5; // 60 дней
  return arr.filter(x => !(x.deleted && (x.updatedAt || 0) < cutoff));
}

let syncing = false;
async function syncNow(manual = false, silent = false) {
  if (!cfg.token || !cfg.gistId) { if (manual) openSettings(); return; }
  if (syncing) return;
  if (!navigator.onLine) { setSync("dirty"); if (manual) toast("Нет сети — сохранено локально"); return; }
  syncing = true; setSync("syncing");
  try {
    const r = await gh("/gists/" + cfg.gistId);
    if (r.status === 404) throw new Error("Гист не найден. Возможно, удалён — отключи и подключи заново.");
    if (r.status === 401) throw new Error("Токен больше не действует.");
    if (!r.ok) throw new Error("GitHub " + r.status);
    const g = await r.json();
    let remote = { categories: [], items: [] };
    const f = g.files && g.files[SYNC_FILE];
    if (f) {
      let txt = f.content;
      if (f.truncated && f.raw_url) txt = await (await fetch(f.raw_url)).text();
      try { remote = JSON.parse(txt) || remote; } catch {}
    }
    // слияние
    const mergedCats = pruneTombstones(mergeArr(data.categories, remote.categories));
    const mergedItems = pruneTombstones(mergeArr(data.items, remote.items));
    const before = JSON.stringify({ c: data.categories, i: data.items });
    data.categories = mergedCats; data.items = mergedItems;
    if (!liveCats().length) data.categories = seedCategories();
    saveData();
    const remoteStr = JSON.stringify({ categories: remote.categories || [], items: remote.items || [] });
    const localStr = JSON.stringify(exportData());
    if (remoteStr !== localStr) {
      const pr = await gh("/gists/" + cfg.gistId, {
        method: "PATCH",
        body: JSON.stringify({ files: { [SYNC_FILE]: { content: localStr } } })
      });
      if (!pr.ok) throw new Error("Не удалось отправить (" + pr.status + ")");
    }
    cfg.lastSync = now(); saveCfg();
    setSync("idle"); render();
    if (manual && !silent) toast("Синхронизировано ✓");
  } catch (e) {
    setSync("error"); render();
    if (manual) toast(e.message || "Ошибка синхронизации");
  } finally {
    syncing = false;
  }
}

function setSync(s) { syncState = s; renderTopbar(); }
function markDirty() {
  if (!cfg.token || !cfg.gistId) return;
  setSync("dirty");
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncNow(false), 1500);
}

/* ---------- композер ---------- */
function autoGrow(el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, window.innerHeight * 0.4) + "px"; }
function updateSendState() { $("#send").disabled = !$("#input").value.trim(); }

function wireComposer() {
  const inp = $("#input");
  inp.addEventListener("input", () => { autoGrow(inp); updateSendState(); });
  inp.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); quickAdd(); }
  });
  $("#send").onclick = quickAdd;
  $("#detailBtn").onclick = () => {
    const raw = inp.value.trim();
    editItem(null);
    if (raw) {
      const url = firstUrl(raw);
      $("#fTitle").value = url ? raw.replace(url, "").trim() || domain(url) : raw;
      if (url) $("#fUrl").value = url;
      inp.value = ""; updateSendState();
    }
  };
}

/* ---------- toast ---------- */
let toastTimer = null;
function toast(msg) {
  const t = $("#toast"); t.innerHTML = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2000);
}

/* ---------- первый запуск ---------- */
function maybeOnboard() {
  if (cfg.me || cfg.token) return;
  const body = `
    <div class="note-info" style="line-height:1.6;text-align:center">
      <div style="font-size:34px;margin-bottom:6px">🎁✈️📍</div>
      Общий список желаний, ссылок и мест — для двоих.<br>Работает офлайн, а чтобы видеть друг у друга — подключается GitHub (по желанию, потом).
    </div>
    <div class="field"><label>Как тебя зовут</label>
      <input class="input" id="oMe" placeholder="Антон / Диана"></div>
    <div class="actions">
      <button class="btn primary" id="oGo">Начать</button>
    </div>`;
  openSheet(`<span style="width:52px"></span><h2>Привет!</h2><span style="width:52px"></span>`, body);
  $("#oGo").onclick = () => {
    cfg.me = ($("#oMe").value || "").trim(); saveCfg(); renderTopbar(); closeSheet();
    toast("Готово! Добавляй хотелки внизу");
  };
}

/* ---------- старт ---------- */
function init() {
  load(); applyTheme(); render(); wireComposer();
  maybeOnboard();
  if (cfg.token && cfg.gistId) syncNow(false, true);

  window.addEventListener("online", () => { if (syncState === "dirty" || syncState === "error") syncNow(false); });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && cfg.token && cfg.gistId) syncNow(false, true);
  });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener && mq.addEventListener("change", () => { if ((cfg.theme || "auto") === "auto") applyTheme(); });
}
init();
