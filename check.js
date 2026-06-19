try { process.loadEnvFile('.env'); } catch {}

const URLS = (process.env.URLS || '').split(',').map(s => s.trim()).filter(Boolean);
const TG_TOKEN = process.env.TG_TOKEN || '';
const CHAT_ID = process.env.CHAT_ID || '';
const KEYWORD = process.env.KEYWORD || '';
const INTERVAL_MS = Number(process.env.INTERVAL_MS) || 30 * 60 * 1000;
const RENOTIFY_COOLDOWN_MS = Number(process.env.RENOTIFY_COOLDOWN_MS) || 30 * 60 * 1000;
const USER_AGENT = process.env.USER_AGENT
  || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

if (URLS.length === 0) { console.error('URLS env is required (comma-separated)'); process.exit(1); }
if (!TG_TOKEN || !CHAT_ID) { console.error('TG_TOKEN and CHAT_ID env are required'); process.exit(1); }

const lastState = new Map();
const lastNotifyAt = new Map();

async function sendTg(text) {
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, disable_web_page_preview: true }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`telegram ${res.status}: ${body}`);
  }
}

function parseProducts(html) {
  const re = /<div class="package" id="(product\d+)">/g;
  const positions = [];
  let m;
  while ((m = re.exec(html)) !== null) positions.push({ id: m[1], start: m.index });
  const products = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].start;
    const end = i + 1 < positions.length ? positions[i + 1].start : html.length;
    const block = html.slice(start, end);
    const titleM = block.match(/package-title">([^<]+)</);
    const title = titleM ? titleM[1].trim() : positions[i].id;
    const btnM = block.match(/<a[^>]*class="[^"]*btn-order-now[^"]*"[^>]*>/);
    let inStock;
    if (!btnM) inStock = null;
    else inStock = !/\bdisabled\b/.test(btnM[0]);
    const hrefM = block.match(/href="([^"]+)"[^>]*btn-order-now/) || block.match(/btn-order-now[^>]*href="([^"]+)"/);
    products.push({ id: positions[i].id, title, inStock, href: hrefM ? hrefM[1] : null });
  }
  return products;
}

function resolveHref(pageUrl, href) {
  if (!href) return null;
  try { return new URL(href, pageUrl).toString(); } catch { return null; }
}

async function checkOnce(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const html = await res.text();
  const all = parseProducts(html);
  const targets = KEYWORD ? all.filter(p => p.title.includes(KEYWORD)) : all;
  if (targets.length === 0) {
    console.log(`[${new Date().toISOString()}] ${url} no products${KEYWORD ? ` match "${KEYWORD}"` : ''}`);
    return;
  }
  const summary = targets.map(p => `${p.title}=${p.inStock === null ? '?' : p.inStock ? 'Y' : 'N'}`).join(' ');
  console.log(`[${new Date().toISOString()}] ${url} ${summary}`);

  const restocked = [];
  for (const p of targets) {
    const key = `${url}#${p.id}`;
    if (p.inStock !== true) {
      lastState.set(key, p.inStock);
      continue;
    }
    const prev = lastState.get(key);
    const now = Date.now();
    const last = lastNotifyAt.get(key) || 0;
    const firstSeen = !lastState.has(key);
    const transitioned = prev === false;
    const cooledDown = now - last > RENOTIFY_COOLDOWN_MS;
    if ((transitioned || (firstSeen && cooledDown)) && cooledDown) {
      restocked.push({ p, key });
      lastNotifyAt.set(key, now);
    }
    lastState.set(key, true);
  }

  if (restocked.length > 0) {
    const lines = restocked.map(({ p }) => {
      const link = resolveHref(url, p.href);
      return `• ${p.title}${link ? `\n  ${link}` : ''}`;
    });
    const header = KEYWORD ? `✅ ${KEYWORD} 补货啦` : '✅ 补货啦';
    const text = `${header}\n${lines.join('\n')}\n\n${url}`;
    try {
      await sendTg(text);
      console.log(`[${new Date().toISOString()}] notified: ${restocked.map(({ p }) => p.title).join(', ')}`);
    } catch (e) {
      for (const { key } of restocked) lastNotifyAt.delete(key);
      throw e;
    }
  }
}

async function main() {
  console.log(`watching ${URLS.length} url(s) every ${INTERVAL_MS}ms${KEYWORD ? ` for "${KEYWORD}" restock` : ''}`);
  for (const u of URLS) console.log(`  - ${u}`);
  const startupMsg = KEYWORD
    ? `🟢 WhmcsMonitor 已启动: ${KEYWORD} (${URLS.length} url)`
    : `🟢 WhmcsMonitor 已启动 (${URLS.length} url)`;
  try { await sendTg(startupMsg); } catch (e) { console.error('startup tg failed:', e.message); }
  while (true) {
    for (const url of URLS) {
      try { await checkOnce(url); }
      catch (e) { console.error(`[${new Date().toISOString()}] ${url} check failed:`, e.message); }
    }
    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
}

main();
