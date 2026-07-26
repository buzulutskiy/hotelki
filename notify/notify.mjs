/**
 * Отправитель push для «Хотелки».
 * Запускается по расписанию из GitHub Actions: читает общий гист, находит записи,
 * о которых ещё не уведомляли, и шлёт web-push тем, кто НЕ автор записи.
 *
 * Нужны переменные окружения:
 *   GIST_TOKEN     — GitHub PAT со scope `gist` (тот же аккаунт, что владеет гистом)
 *   VAPID_PRIVATE  — приватный VAPID-ключ (секрет репозитория)
 *   VAPID_PUBLIC   — публичный VAPID-ключ (необязательно; по умолчанию зашит ниже)
 *   VAPID_SUBJECT  — mailto:... (необязательно)
 */
import webpush from "web-push";

const SYNC_FILE = "hotelki-data.json";
const PUSH_FILE = "hotelki-push.json";
const SYNC_TAG = "#хотелки-sync";
const APP_URL = "https://buzulutskiy.github.io/hotelki/";

const TOKEN = process.env.GIST_TOKEN;
const VAPID_PUBLIC = process.env.VAPID_PUBLIC || "BIqpvKoU0cH21OKWV7Yuuysc96SYa5Y5fQ_GCss1M24jj9YQXCx00DNs8oznyrFeBrxxsSU35sP2cHlow-clIKI";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:hotelki@buzulutskiy.dev";

if (!TOKEN) { console.error("нет GIST_TOKEN"); process.exit(1); }
if (!VAPID_PRIVATE) { console.error("нет VAPID_PRIVATE"); process.exit(1); }
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const H = {
  "Authorization": `Bearer ${TOKEN}`,
  "Accept": "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28"
};
const api = (p, opts = {}) => fetch("https://api.github.com" + p, { ...opts, headers: { ...H, ...(opts.headers || {}) } });

function domain(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }

async function readFile(gistId, name, def) {
  const g = await (await api("/gists/" + gistId)).json();
  const f = g.files && g.files[name];
  if (!f) return def;
  let t = f.content;
  if (f.truncated && f.raw_url) t = await (await fetch(f.raw_url)).text();
  try { return JSON.parse(t); } catch { return def; }
}

async function main() {
  // найти общий гист
  const list = await (await api("/gists?per_page=100")).json();
  if (!Array.isArray(list)) { console.error("gist list error", list); process.exit(1); }
  const g = list.find(x => (x.files && x.files[SYNC_FILE]) || (x.description || "").includes(SYNC_TAG));
  if (!g) { console.log("общий гист не найден — нечего слать"); return; }
  const gistId = g.id;

  const data = await readFile(gistId, SYNC_FILE, { items: [], categories: [] });
  const push = await readFile(gistId, PUSH_FILE, { subscriptions: [] });
  const subs = Array.isArray(push.subscriptions) ? push.subscriptions : [];
  const items = (data.items || []).filter(i => !i.deleted);

  const savePush = async (pf) => {
    await api("/gists/" + gistId, { method: "PATCH", body: JSON.stringify({ files: { [PUSH_FILE]: { content: JSON.stringify(pf) } } }) });
  };

  // первый запуск: помечаем всё существующее как «уже уведомлено», без спама
  if (!Array.isArray(push.notified)) {
    push.notified = items.map(i => i.id);
    await savePush(push);
    console.log("baseline: помечено", push.notified.length, "записей");
    return;
  }
  if (!subs.length) { console.log("нет подписок"); return; }

  const notified = new Set(push.notified);
  const fresh = items.filter(i => !notified.has(i.id));
  if (!fresh.length) { console.log("новых записей нет"); return; }

  const catName = id => { const c = (data.categories || []).find(c => c.id === id); return c ? `${c.em} ${c.title}` : ""; };

  let sent = 0;
  const dead = new Set();
  for (const s of subs) {
    if (!s.sub || !s.sub.endpoint) continue;
    // не уведомляем автора о его же записях (сравнение имени без регистра)
    const forThem = fresh.filter(i => (i.by || "").trim().toLowerCase() !== (s.name || "").trim().toLowerCase());
    if (!forThem.length) continue;

    let title, body;
    if (forThem.length === 1) {
      const it = forThem[0];
      title = it.by ? `Новое от ${it.by}` : "Новая хотелка";
      const cat = catName(it.cat);
      body = (cat ? cat + " · " : "") + it.title + (it.url ? "  🔗 " + domain(it.url) : "");
    } else {
      const authors = [...new Set(forThem.map(i => i.by).filter(Boolean))];
      title = authors.length === 1 ? `Новое от ${authors[0]}: ${forThem.length}` : `Новых хотелок: ${forThem.length}`;
      body = forThem.slice(0, 3).map(i => "• " + i.title).join("\n") + (forThem.length > 3 ? `\n…и ещё ${forThem.length - 3}` : "");
    }

    try {
      await webpush.sendNotification(s.sub, JSON.stringify({ title, body, url: APP_URL, tag: "hotelki-new" }));
      sent++;
    } catch (err) {
      const code = err.statusCode;
      if (code === 404 || code === 410) dead.add(s.sub.endpoint);
      else console.log("ошибка отправки", code, (err.body || "").slice(0, 120));
    }
  }

  // помечаем свежие как уведомлённые; чистим список до существующих записей и убираем мёртвые подписки
  const liveIds = new Set(items.map(i => i.id));
  push.notified = [...new Set([...notified, ...fresh.map(i => i.id)])].filter(id => liveIds.has(id));
  push.subscriptions = subs.filter(s => !(s.sub && dead.has(s.sub.endpoint)));
  await savePush(push);
  console.log(`отправлено push: ${sent}; новых записей: ${fresh.length}; удалено мёртвых подписок: ${dead.size}`);
}

main().catch(e => { console.error(e); process.exit(1); });
