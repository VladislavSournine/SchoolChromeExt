// Pure parsing / shaping helpers. Loaded as a content script (globals) and by Node tests (CommonJS).

const ENTITIES = { '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&#039;': "'", '&#39;': "'" };

function decodeEntities(s) {
  return s.replace(/&(quot|amp|lt|gt|#039|#39);/g, (m) => ENTITIES[m]);
}

// Opening tag of a server-rendered Vue component -> its `:prop="json"` attributes, parsed.
function readProps(html, tag) {
  const start = html.indexOf('<' + tag);
  if (start === -1) return null;
  let end = start;
  let quoted = false;
  while (end < html.length && (quoted || html[end] !== '>')) {
    if (html[end] === '"') quoted = !quoted;
    end++;
  }
  const openTag = html.slice(start, end);
  const props = {};
  for (const [, name, value] of openTag.matchAll(/\s:([\w-]+)="([^"]*)"/g)) {
    const expr = decodeEntities(value);
    // Props are JS expressions: usually JSON, but plain strings come single-quoted ('1867').
    const quoted = /^'(.*)'$/s.exec(expr);
    try {
      props[name] = quoted ? quoted[1].replace(/\\(.)/g, '$1') : JSON.parse(expr);
    } catch {
      props[name] = null;
    }
  }
  return props;
}

const JOURNAL_URL = /\/journal\/(\d+)\/(\d+)\/(\d{4}-\d{2}-\d{2})\//;

function journalFromHtml(html) {
  const p = readProps(html, 'journal-lessons-index');
  // A prop that failed to parse is null — fail loudly rather than export an empty sheet.
  if (!p || !Array.isArray(p.list_lessons) || p.students === null || p.list_grades === null) {
    throw new Error('NOT_A_JOURNAL');
  }
  const active = p.selected_subject || (p.subjects || []).find((s) => s.active);
  const lessons = p.list_lessons.map((l) => {
    const m = JOURNAL_URL.exec(l.url || '');
    return {
      id: l.id,
      date: m ? m[3] : '',
      title: l.name || '',
      special: l.special_grade_name || '',
      canceled: Boolean(l.canceled),
      url: l.url,
      needsDetails: Boolean(l.have_topic || l.have_homework),
    };
  });
  const grades = {};
  for (const [lessonId, byStudent] of Object.entries(p.list_grades || {})) {
    if (!byStudent || typeof byStudent !== 'object') continue;
    grades[lessonId] = {};
    for (const [studentId, g] of Object.entries(byStudent)) {
      grades[lessonId][studentId] = { type: g.type, value: g.grade_value || '', comment: g.comment || '' };
    }
  }
  return {
    className: (p.student_class && p.student_class.name) || '',
    subjectName: active ? active.name : '',
    students: (p.students || []).map((s) => ({ id: s.id, name: s.name })),
    lessons,
    grades,
  };
}

function lessonDetailsFromHtml(html) {
  const p = readProps(html, 'journal-lessons-index');
  const l = (p && p.selected_lesson) || {};
  return { topic: l.topic || '', homework: l.homework || '' };
}

function journalKeysFromSchedule(weeks) {
  const keys = [];
  for (const week of weeks) {
    for (const day of (week && week.week_days) || []) {
      for (const slot of Object.values(day.lessons || {})) {
        for (const lesson of slot) {
          const m = JOURNAL_URL.exec(lesson.url || '');
          if (m && !keys.includes(m[1] + '/' + m[2])) keys.push(m[1] + '/' + m[2]);
        }
      }
    }
  }
  return keys;
}

function schoolYearStart(today) {
  const year = today.getMonth() + 1 < 9 ? today.getFullYear() - 1 : today.getFullYear();
  return year + '-09-01';
}

function inPeriod(lessons, from, to) {
  return lessons.filter((l) => l.date >= from && l.date <= to);
}

const uaDate = (iso) => iso.split('-').reverse().join('.');
const cellValue = (v) => (/^\d+(\.\d+)?$/.test(v) ? Number(v) : v);

function sheetName(raw, used) {
  const base = raw.replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Журнал';
  let name = base;
  // Excel compares sheet names case-insensitively.
  for (let n = 2; used.has(name.toLowerCase()); n++) name = base.slice(0, 31 - ` (${n})`.length) + ` (${n})`;
  used.add(name.toLowerCase());
  return name;
}

function buildSheets(journals) {
  const used = new Set(['усі записи']);
  const flat = [['Клас', 'Предмет', 'Дата', 'Учень', 'Тип', 'Оцінка', 'Коментар']];
  const TYPES = { grade: 'оцінка', mark: 'відмітка', comment: 'коментар' };
  const sheets = journals.map((j) => {
    const details = j.details || {};
    const header = ['№', 'Учень'];
    const topics = ['', 'Тема'];
    const homeworks = ['', 'ДЗ'];
    for (const l of j.lessons) {
      header.push(uaDate(l.date) + (l.special ? ' ' + l.special : '') + (l.canceled ? ' (скасовано)' : ''));
      topics.push((details[l.id] && details[l.id].topic) || '');
      homeworks.push((details[l.id] && details[l.id].homework) || '');
    }
    const gradeOf = (l, s) => j.grades[l.id] && j.grades[l.id][s.id];
    const rows = [header, topics, homeworks];
    j.students.forEach((s, i) => {
      rows.push([i + 1, s.name, ...j.lessons.map((l) => {
        const g = gradeOf(l, s);
        return g && g.value ? cellValue(g.value) : null;
      })]);
    });
    for (const l of j.lessons) {
      for (const s of j.students) {
        const g = gradeOf(l, s);
        if (g) flat.push([j.className, j.subjectName, uaDate(l.date), s.name, TYPES[g.type] || g.type, cellValue(g.value), g.comment]);
      }
    }
    return { name: sheetName(`${j.className} ${j.subjectName}`, used), rows };
  });
  sheets.push({ name: 'Усі записи', rows: flat });
  return sheets;
}

const AikCore = {
  readProps, journalFromHtml, lessonDetailsFromHtml, journalKeysFromSchedule,
  schoolYearStart, inPeriod, buildSheets,
};
if (typeof module !== 'undefined') module.exports = AikCore;
