// «Наш маршрут»: разворачивает ссылку Google Maps (в том числе короткую maps.app.goo.gl) в адрес и точные координаты.
// Браузер сам этого не может (CORS), поэтому это маленький веб-сервис на Google Apps Script.
//
// Как развернуть (один раз, ~2 минуты):
//   1. script.google.com → «Создать проект», стереть всё и вставить этот файл.
//   2. «Развертывание» → «Новое развертывание» → шестерёнка → «Веб-приложение».
//      Запуск от имени: «Я». У кого есть доступ: «Все». → «Развернуть», разрешить доступ.
//   3. Скопировать URL веб-приложения (…/exec) в константу RESOLVER в index.html.
//
// Ответ: {url, q?, lat?, lng?} или {error}. Ходит только на домены Google Maps, так что открытым прокси не станет.

const ALLOWED = /^https:\/\/(maps\.app\.goo\.gl\/|goo\.gl\/maps\/|(www\.)?google\.[a-z.]{2,6}\/maps|maps\.google\.[a-z.]{2,6}[/?])/i;
const GOOGLE = /^https:\/\/([a-z0-9-]+\.)*(google\.[a-z.]{2,6}|goo\.gl)([/?]|$)/i;

function doGet(e) {
  let out;
  try { out = resolve(String((e && e.parameter && e.parameter.url) || '').trim()); }
  catch (err) { out = { error: String((err && err.message) || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function get(url) {
  return UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true, headers: { 'Accept-Language': 'en' } });
}

function resolve(url) {
  if (!ALLOWED.test(url)) return { error: 'not a google maps link' };
  let cur = url, body = '';
  for (let i = 0; i < 6; i++) { // редиректы вручную, чтобы знать конечный URL
    const r = get(cur), code = r.getResponseCode();
    if (code >= 300 && code < 400) {
      const h = r.getHeaders(), loc = h.Location || h.location;
      if (!loc) break;
      const next = /^https?:/i.test(loc) ? loc : cur.match(/^https:\/\/[^/]+/)[0] + loc;
      if (!GOOGLE.test(next)) break;
      cur = next; continue;
    }
    if (code === 200) body = r.getContentText();
    break;
  }
  const out = { url: cur };
  const q = param(cur, 'q') || param(cur, 'query');
  if (q) out.q = q;
  const c = coordsIn(cur);
  if (c) { out.lat = c[0]; out.lng = c[1]; return out; }
  // Точку места страница не содержит, её отдаёт /maps/preview/place, ссылку на который страница даёт сама
  const m = body.match(/href="(\/maps\/preview\/place\?[^"]+)"/);
  if (m) {
    const r = get('https://www.google.com' + m[1].replace(/&amp;/g, '&'));
    const p = r.getResponseCode() === 200 ? r.getContentText().match(/\[null,null,(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)\]/) : null;
    if (p) { out.lat = +p[1]; out.lng = +p[2]; }
  }
  return out;
}

function param(url, name) {
  const m = url.match(new RegExp('[?&]' + name + '=([^&#]*)'));
  if (!m) return '';
  try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return m[1]; }
}

function coordsIn(url) {
  const m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
    url.match(/[?&](?:q|query|ll|center)=(-?\d{1,2}\.\d+)(?:,|%2C)\s*(-?\d{1,3}\.\d+)(?:&|$)/i);
  return m ? [+m[1], +m[2]] : null;
}
