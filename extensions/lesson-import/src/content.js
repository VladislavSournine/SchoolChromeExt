/* Уроки в журнал A+ — кнопка на сторінці «Розклад вчителя».

Обираєш папку тижня (~/Downloads/02.11–06.11) з uroky.json (формат — README.md) →
бачиш таблицю перевірки → «Завантажити вибрані».

Головне правило: ЗАПОВНЕНЕ НЕ ПЕРЕЗАПИСУЄТЬСЯ. Кожне поле (тема, файли уроку, ДЗ, файли ДЗ)
пишеться лише якщо воно порожнє, і стан перечитується з порталу прямо перед записом.

Урок шукається за id класу й предмета з адреси журналу (/journal/<клас>/<предмет>/<дата>/<номер>),
не за назвою: «8ІТ» на порталі кирилицею, «6IT» — латиницею.

Як портал зберігає (так само робить сама сторінка журналу):
  файли — POST /lessons/file, multipart <поле>[i] → {data: [{id, original_name}]}
  поле  — PUT /lessons/<id> {lesson: id, <поле>: значення}
*/
(() => {
  const POLYA = [
    {key: 'topic', nazva: 'Тема', zayvo: l => !!(l.topic || '').trim()},
    {key: 'lesson_files_id', nazva: 'Файли уроку', faily: 'lesson_files', zayvo: l => (l.lesson_files_id || []).length > 0},
    {key: 'homework', nazva: 'ДЗ', zayvo: l => !!(l.homework || '').trim()},
    {key: 'homework_files_id', nazva: 'Файли ДЗ', faily: 'homework_files', zayvo: l => (l.homework_files_id || []).length > 0},
  ];

  const uid = document.querySelector('meta[name=user-id]')?.content;
  const csrf = document.querySelector('meta[name=csrf-token]')?.content;
  const HEADERS = {'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-TOKEN': csrf, 'Accept': 'application/json'};
  const nfc = s => s.normalize('NFC');  // macOS може віддати назви файлів у NFD

  // Тиждень 1 — той, що з 31.08 (понеділок тижня з 1 вересня).
  function tyzhden(iso) {
    const d = new Date(iso + 'T12:00:00');
    const rik = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
    const v1 = new Date(rik, 8, 1, 12);
    v1.setDate(v1.getDate() - ((v1.getDay() + 6) % 7));
    return Math.floor((d - v1) / (7 * 864e5)) + 1;
  }
  const isoDoDmy = iso => iso.split('-').reverse().join('.');

  async function rozklad(w) {
    const r = await fetch(`/schedule/teacher/get/${uid}/${w}`, {headers: HEADERS});
    if (!r.ok) throw new Error(`розклад тижня ${w}: HTTP ${r.status}`);
    return r.json();
  }

  // Повний стан уроку — у сторінці журналу, атрибут :selected_lesson.
  async function stanUroku(url) {
    const h = await fetch(url).then(r => r.text());
    const el = new DOMParser().parseFromString(h, 'text/html').querySelector('journal-lessons-index');
    if (!el) throw new Error('не відкрився журнал (вийшли з акаунта?)');
    return JSON.parse(el.getAttribute(':selected_lesson'));
  }

  async function zavantazhFaily(pole, faily) {
    const fd = new FormData();
    faily.forEach((f, i) => fd.append(`${pole}[${i}]`, f, f.name));
    const r = await fetch('/lessons/file', {method: 'POST', headers: HEADERS, body: fd});
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !Array.isArray(j.data)) throw new Error(`файли: HTTP ${r.status}`);
    // У тому ж порядку, що й надіслали (презентація перша).
    return faily.map(f => {
      const z = j.data.find(x => nfc(x.original_name || '') === nfc(f.name));
      if (!z) throw new Error(`портал не повернув «${f.name}»`);
      return z.id;
    });
  }

  async function zapysatyPole(id, key, value) {
    const r = await fetch(`/lessons/${id}`, {
      method: 'PUT', headers: {...HEADERS, 'Content-Type': 'application/json'},
      body: JSON.stringify({lesson: id, [key]: value}),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.status !== 'success') throw new Error(`${key}: HTTP ${r.status}`);
  }

  // ---------- інтерфейс ----------
  const css = `
    #aikz-btn{position:fixed;right:20px;bottom:20px;z-index:99999;padding:12px 18px;border:0;border-radius:8px;
      background:#1f6feb;color:#fff;font:600 15px system-ui;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)}
    #aikz{position:fixed;inset:24px;z-index:99999;background:#fff;color:#111;border-radius:10px;
      box-shadow:0 8px 40px rgba(0,0,0,.35);display:flex;flex-direction:column;font:14px system-ui}
    #aikz header{display:flex;gap:12px;align-items:center;padding:14px 18px;border-bottom:1px solid #ddd}
    #aikz header b{font-size:17px;margin-right:auto}
    #aikz button{padding:8px 14px;border-radius:6px;border:1px solid #888;background:#fff;font:600 14px system-ui;cursor:pointer}
    #aikz button.go{background:#1a7f37;border-color:#1a7f37;color:#fff}
    #aikz button:disabled{opacity:.45;cursor:default}
    #aikz .body{overflow:auto;padding:12px 18px;flex:1}
    #aikz table{border-collapse:collapse;width:100%}
    #aikz th,#aikz td{border-bottom:1px solid #e5e5e5;padding:7px 8px;text-align:left;vertical-align:top}
    #aikz th{position:sticky;top:0;background:#f6f6f6}
    #aikz .new{color:#1a7f37;font-weight:600} #aikz .skip{color:#777} #aikz .err{color:#c62828;font-weight:600}
    #aikz tr.bad td{background:#fff3f3} #aikz .log{white-space:pre-wrap;color:#444;margin-top:10px}
    #aikz .status{display:flex;align-items:center;gap:8px;color:#333;font-weight:600}
    #aikz .spin{width:18px;height:18px;border:3px solid #cfd8e3;border-top-color:#1f6feb;border-radius:50%;animation:aikz-spin .8s linear infinite}
    @keyframes aikz-spin{to{transform:rotate(360deg)}}
    #aikz .done{padding:12px 14px;border-radius:8px;margin-bottom:12px;font-weight:700;font-size:16px}
    #aikz .done.ok{background:#e6f4ea;color:#1a7f37} #aikz .done.fail{background:#fdecea;color:#c62828}`;
  document.head.append(Object.assign(document.createElement('style'), {textContent: css}));

  const btn = Object.assign(document.createElement('button'), {id: 'aikz-btn', textContent: 'Уроки з папки'});
  document.body.append(btn);
  btn.onclick = vidkryty;

  let plan = [];

  function vidkryty() {
    document.getElementById('aikz')?.remove();
    const p = document.createElement('div');
    p.id = 'aikz';
    p.innerHTML = `<header><b>Уроки в журнал</b>
        <span class="status"></span>
        <button data-a="papka">Обрати папку тижня</button>
        <button data-a="go" class="go" disabled>Завантажити вибрані</button>
        <button data-a="x">Закрити</button></header>
      <div class="body"><p>Оберіть папку тижня (наприклад <code>Downloads/19-23</code>) — у ній має бути <code>uroky.json</code>.
        Спершу буде таблиця перевірки, нічого не завантажується без кнопки «Завантажити вибрані».</p></div>
      <input type="file" webkitdirectory hidden>`;
    document.body.append(p);
    const input = p.querySelector('input');
    p.querySelector('[data-a=x]').onclick = () => p.remove();
    // Між «Дозволити» і подією change Chrome мовчки читає папку — спінер уже з моменту вибору.
    p.querySelector('[data-a=papka]').onclick = () => { status('Чекаю папку… Chrome читає файли'); input.click(); };
    input.addEventListener('cancel', () => status(''));
    input.onchange = () => pidhotuvaty([...input.files]).catch(e => pokazatyPomylku(e));
    p.querySelector('[data-a=go]').onclick = () => vykonaty().catch(e => pokazatyPomylku(e));
  }

  const body = () => document.querySelector('#aikz .body');
  const pokazatyPomylku = e => {
    status('');
    knopky(true);
    body().insertAdjacentHTML('beforeend', '<p class="err"></p>');
    body().lastElementChild.textContent = 'Помилка: ' + e.message;
  };
  // Спінер + текст у шапці; status('') — сховати.
  function status(text) {
    const s = document.querySelector('#aikz .status');
    s.replaceChildren();
    if (!text) return;
    s.append(Object.assign(document.createElement('span'), {className: 'spin'}), text);
  }
  // Поки йде робота — кнопки неактивні, щоб не натиснути двічі.
  const knopky = on => document.querySelectorAll('#aikz header button:not([data-a=x])').forEach(b => { b.disabled = !on; });

  async function pidhotuvaty(files) {
    knopky(false);
    status('Читаю папку…');
    body().textContent = '';
    // Шляхи відносно обраної папки: «19-23/21/x.pdf» → «21/x.pdf»
    const map = new Map(files.map(f => [nfc(f.webkitRelativePath.split('/').slice(1).join('/')), f]));
    const mf = map.get('uroky.json');
    if (!mf) throw new Error('у папці немає uroky.json — спершу node office/eksport-pdf.js');
    const uroky = JSON.parse(await mf.text());

    const tyzhni = {};
    plan = [];
    for (const [i, u] of uroky.entries()) {
      status(`Перевіряю урок ${i + 1} з ${uroky.length}: ${u.klas} ${u.predmet}…`);
      const w = tyzhden(u.data);
      tyzhni[w] = tyzhni[w] || await rozklad(w);
      const den = tyzhni[w].week_days.find(d => d.date === isoDoDmy(u.data));
      if (!den) throw new Error(`тиждень ${w} не містить ${u.data} — перевір розклад`);
      const shlyakh = `/journal/${u.klas_id}/${u.predmet_id}/${u.data}/`;
      const zbig = Object.values(den.lessons || {}).flat().filter(l => (l.url || '').includes(shlyakh) && !l.canceled);
      const r = {u, pomylka: null, urok: null, stan: null, faily: {}};
      plan.push(r);
      if (zbig.length !== 1) { r.pomylka = zbig.length ? 'у цей день два таких уроки' : 'уроку немає в розкладі'; continue; }
      r.urok = zbig[0];
      const vidsutni = [...u.fayly_uroku, ...u.fayly_dz].filter(f => !map.has(nfc(f)));
      if (vidsutni.length) { r.pomylka = 'немає файлу: ' + vidsutni.join(', '); continue; }
      r.faily.lesson_files = u.fayly_uroku.map(f => map.get(nfc(f)));
      r.faily.homework_files = u.fayly_dz.map(f => map.get(nfc(f)));
      r.stan = await stanUroku(r.urok.url);
      if (r.stan.id !== r.urok.id) r.pomylka = 'журнал відкрив інший урок';
      else if (!r.stan.can_edit) r.pomylka = 'урок не можна редагувати';
    }
    plan.sort((a, b) => (a.u.data + (a.urok?.order_num_in_day ?? 0)).localeCompare(b.u.data + (b.urok?.order_num_in_day ?? 0)));
    status('');
    knopky(true);
    malyuvaty();
  }

  // Поле без файлів у uroky.json (fayly_dz: [] — ДЗ посиланням) не пишемо і не перевіряємо.
  const potribni = r => POLYA.filter(p => !p.faily || r.faily[p.faily].length);
  const shchoRobyty = r => r.pomylka ? [] : potribni(r).filter(p => !p.zayvo(r.stan));
  const znachennya = (r, p) => p.key === 'topic' ? r.u.tema : p.key === 'homework' ? r.u.dz : null;

  function malyuvaty(log = '', pidsumok = null) {
    const t = document.createElement('table');
    t.innerHTML = `<tr><th></th><th>Дата · урок</th><th>Клас</th><th>Предмет</th><th>Тема</th>${POLYA.map(p => `<th>${p.nazva}</th>`).join('')}</tr>`;
    for (const [i, r] of plan.entries()) {
      const tr = t.insertRow();
      const robyty = shchoRobyty(r);
      if (r.pomylka) tr.className = 'bad';
      const cb = Object.assign(document.createElement('input'), {type: 'checkbox', checked: robyty.length > 0, disabled: robyty.length === 0});
      cb.dataset.i = i;
      tr.insertCell().append(cb);
      const [, mm, dd] = r.u.data.split('-');
      [`${dd}.${mm} · ${r.urok ? r.urok.order_num_in_day : '?'}`, r.u.klas, r.u.predmet, r.u.tema].forEach(s => { tr.insertCell().textContent = s; });
      for (const p of POLYA) {
        const td = tr.insertCell();
        if (r.pomylka) { td.className = 'err'; td.textContent = p === POLYA[0] ? r.pomylka : ''; continue; }
        const nove = robyty.includes(p);
        td.className = nove ? 'new' : 'skip';
        td.textContent = nove ? (p.faily ? r.faily[p.faily].map(f => '+ ' + f.name).join('\n') : '+ ' + znachennya(r, p))
          : potribni(r).includes(p) ? 'вже є — пропуск' : '—';
        td.style.whiteSpace = 'pre-line';
      }
    }
    body().replaceChildren(t);
    if (pidsumok) body().prepend(Object.assign(document.createElement('div'), {className: 'done ' + (pidsumok.ok ? 'ok' : 'fail'), textContent: pidsumok.text}));
    if (log) body().insertAdjacentHTML('beforeend', '<div class="log"></div>'), (body().lastElementChild.textContent = log);
    const go = document.querySelector('#aikz [data-a=go]');
    const onChange = () => {
      const n = body().querySelectorAll('input:checked').length;
      delete go.dataset.confirm;  // змінив вибір — підтверджувати заново
      go.disabled = !n; go.textContent = `Завантажити вибрані (${n})`;
    };
    t.addEventListener('change', onChange);
    onChange();
  }

  async function vykonaty() {
    const go = document.querySelector('#aikz [data-a=go]');
    const vybrani = [...body().querySelectorAll('input:checked')].map(c => plan[+c.dataset.i]);
    if (go.dataset.confirm !== '1') {  // друге натискання = підтвердження (без window.confirm)
      go.dataset.confirm = '1';
      go.textContent = `Точно? Натисни ще раз — ${vybrani.length} уроків`;
      return;
    }
    delete go.dataset.confirm;
    knopky(false);
    body().querySelectorAll('input').forEach(c => { c.disabled = true; });
    const log = [];
    let pomylok = 0;
    for (const [i, r] of vybrani.entries()) {
      const nazva = `${r.u.data.slice(8)}.${r.u.data.slice(5, 7)} ${r.u.klas} ${r.u.predmet}`;
      const krok = `Завантажую ${i + 1} з ${vybrani.length}: ${r.u.klas} ${r.u.predmet}`;
      try {
        status(`${krok} — перевіряю…`);
        r.stan = await stanUroku(r.urok.url);  // свіжий стан прямо перед записом
        for (const p of potribni(r)) {
          if (p.zayvo(r.stan)) { log.push(`${nazva}: ${p.nazva} — вже є, пропуск`); continue; }
          status(`${krok} — ${p.nazva.toLowerCase()}…`);
          const v = p.faily ? await zavantazhFaily(p.faily, r.faily[p.faily]) : znachennya(r, p);
          await zapysatyPole(r.urok.id, p.key, v);
          log.push(`${nazva}: ${p.nazva} ✓`);
        }
        status(`${krok} — перевіряю, що збереглося…`);
        r.stan = await stanUroku(r.urok.url);
        const ne = potribni(r).filter(p => !p.zayvo(r.stan));
        if (ne.length) pomylok++;
        log.push(ne.length ? `${nazva}: ПІСЛЯ ЗАПИСУ ПОРОЖНЄ — ${ne.map(p => p.nazva).join(', ')}` : `${nazva}: перевірено ✓`);
      } catch (e) {
        pomylok++;
        log.push(`${nazva}: ПОМИЛКА — ${e.message}. Решту полів цього уроку не чіпав.`);
      }
    }
    status('');
    knopky(true);
    const n = vybrani.length;
    malyuvaty(log.join('\n'), pomylok
      ? {ok: false, text: `Завершено з помилками: ${n - pomylok} з ${n} уроків завантажено, помилок ${pomylok} — дивись журнал унизу`}
      : {ok: true, text: `Готово ✓ Завантажено й перевірено уроків: ${n}`});
    body().scrollTop = 0;
  }
})();
