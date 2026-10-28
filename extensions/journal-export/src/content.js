// UI + network orchestration. Runs in the site origin, so requests carry the teacher's session.
(() => {
  const PAUSE_MS = 150;
  const JOURNAL_PATH = /^\/journal\/(\d+\/\d+)\//;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  async function fetchText(path) {
    const res = await fetch(path, { credentials: 'same-origin' });
    if (new URL(res.url).pathname.startsWith('/auth')) throw new Error('AUTH');
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
    return res.text();
  }

  async function myJournalKeys(report) {
    const props = AikCore.readProps(await fetchText('/schedule/teacher'), 'schedule-teacher-index');
    const teacherId = props && props.teacher_id;
    const lastWeek = Number(props && props.selected_week);
    if (!teacherId || !lastWeek) throw new Error('NO_SCHEDULE');
    const weeks = [];
    for (let w = 1; w <= lastWeek; w++) {
      report(`Розклад: тиждень ${w} з ${lastWeek}`);
      weeks.push(JSON.parse(await fetchText(`/schedule/teacher/get/${encodeURIComponent(teacherId)}/${w}`)));
    }
    return AikCore.journalKeysFromSchedule(weeks);
  }

  async function loadJournal(key, now, label, report) {
    const today = isoDate(now);
    const journal = AikCore.journalFromHtml(await fetchText(`/journal/${key}/nearest/${today}`));
    journal.lessons = AikCore.inPeriod(journal.lessons, AikCore.schoolYearStart(now), today);
    journal.details = {};
    let failed = 0;
    const pending = journal.lessons.filter((l) => l.needsDetails);
    for (const [i, lesson] of pending.entries()) {
      report(`${label} ${journal.className} ${journal.subjectName}: тема/ДЗ ${i + 1} з ${pending.length}`);
      try {
        journal.details[lesson.id] = AikCore.lessonDetailsFromHtml(await fetchText(new URL(lesson.url).pathname));
      } catch (e) {
        if (e.message === 'AUTH') throw e;
        console.warn('[journal-export] lesson details failed', lesson.url, e);
        failed++;
      }
      await sleep(PAUSE_MS);
    }
    return { journal, failed };
  }

  async function runExport(keys, fileStem, report) {
    const now = new Date(); // per run: tabs stay open across days
    const journals = [];
    let failed = 0;
    for (const [i, key] of keys.entries()) {
      const r = await loadJournal(key, now, `Журнал ${i + 1}/${keys.length}:`, report);
      journals.push(r.journal);
      failed += r.failed;
    }
    const sheets = AikCore.buildSheets(journals);
    for (const s of sheets) {
      const grid = s !== sheets[sheets.length - 1];
      s.freeze = grid ? [3, 2] : [1, 0];
      s.widths = grid ? [5, 32] : [8, 22, 12, 32, 11, 9, 50];
    }
    const blob = new Blob([makeXlsx(sheets)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${fileStem} ${isoDate(now)}.xlsx`.replace(/[\\/:*?"<>|]/g, '_');
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return { count: journals.length, failed };
  }

  const MESSAGES = {
    AUTH: 'Сесія завершилась — увійдіть у систему й повторіть.',
    NO_SCHEDULE: 'Не вдалося знайти ваш розклад вчителя.',
    NOT_A_JOURNAL: 'Сторінка журналу має неочікуваний формат.',
  };

  function mountUi() {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .wrap { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; font: 13px/1.4 system-ui, sans-serif; }
        .fab, button { cursor: pointer; border: 0; border-radius: 8px; padding: 9px 14px; font: inherit; }
        .fab { background: #2196f3; color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
        .panel { display: none; margin-bottom: 8px; width: 270px; padding: 12px; background: #fff; color: #222;
                 border-radius: 10px; box-shadow: 0 4px 18px rgba(0,0,0,.2); }
        .panel.open { display: block; }
        .panel button { display: block; width: 100%; margin-bottom: 6px; background: #eef5fd; color: #0d47a1; }
        .panel button:disabled { opacity: .5; cursor: default; }
        .hint { color: #666; font-size: 12px; margin: 0 0 8px; }
        .status { min-height: 18px; white-space: pre-wrap; }
      </style>
      <div class="wrap">
        <div class="panel" role="dialog" aria-label="Експорт журналів">
          <p class="hint">Період: з 1 вересня по сьогодні. Файл Excel завантажиться автоматично.</p>
          <button data-mode="current">Цей журнал</button>
          <button data-mode="all">Усі мої журнали</button>
          <div class="status" aria-live="polite"></div>
        </div>
        <button class="fab" aria-expanded="false">Експорт журналів</button>
      </div>`;
    const panel = root.querySelector('.panel');
    const fab = root.querySelector('.fab');
    const status = root.querySelector('.status');
    const buttons = [...root.querySelectorAll('[data-mode]')];
    const current = JOURNAL_PATH.exec(location.pathname);
    if (!current) buttons[0].hidden = true;

    fab.addEventListener('click', () => {
      const open = panel.classList.toggle('open');
      fab.setAttribute('aria-expanded', String(open));
    });

    for (const btn of buttons) {
      btn.addEventListener('click', async () => {
        buttons.forEach((b) => (b.disabled = true));
        const report = (text) => (status.textContent = text);
        try {
          const all = btn.dataset.mode === 'all';
          const keys = all ? await myJournalKeys(report) : [current[1]];
          if (!keys.length) {
            report('У вашому розкладі не знайдено жодного журналу.');
            return;
          }
          const stem = all ? 'Журнали' : `Журнал ${document.title.replace(/^Журнал\s*/, '')}`;
          const { count, failed } = await runExport(keys, stem, report);
          report(`Готово: журналів — ${count}.` + (failed ? `\nНе вдалося завантажити тему/ДЗ для ${failed} урок(ів).` : ''));
        } catch (e) {
          console.error('[journal-export]', e);
          report('Помилка: ' + (MESSAGES[e.message] || e.message));
        } finally {
          buttons.forEach((b) => (b.disabled = false));
        }
      });
    }
    document.body.appendChild(host);
  }

  if (!location.pathname.startsWith('/auth')) mountUi();
})();
