'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core.js');

// ---- fixtures (fake data only) ----
const esc = (obj) =>
  JSON.stringify(obj)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const BASE = 'https://aik.academy.com.ua/journal';
const students = [
  { id: 1, name: 'Тестенко Аня', atSchool: true, order_num: 1, picture: '' },
  { id: 2, name: 'Зразок Богдан', atSchool: true, order_num: 2, picture: '' },
];
const lessons = [
  { id: 100, order_num: 1, name: 'Урок №1', short_date: '21.10', special_grade_type: '', special_grade_name: '',
    was: true, have_topic: true, have_homework: false, canceled: false, url: `${BASE}/56/109/2026-10-21/6` },
  { id: 101, order_num: 2, name: 'Урок №2', short_date: '22.10', special_grade_type: 'x', special_grade_name: 'Зошит',
    was: true, have_topic: false, have_homework: false, canceled: true, url: `${BASE}/56/109/2026-10-22/2` },
  { id: 102, order_num: 3, name: 'Урок №3', short_date: '23.10', special_grade_type: '', special_grade_name: '',
    was: false, have_topic: false, have_homework: true, canceled: false, url: `${BASE}/56/109/2026-10-23/3` },
];
const grades = {
  100: {
    1: { id: 9, type: 'grade', lesson_id: 100, student_id: 1, grade_value: '11', comment: '' },
    2: { id: 10, type: 'mark', lesson_id: 100, student_id: 2, grade_value: 'Н', comment: '' },
  },
  102: { 2: { id: 11, type: 'comment', lesson_id: 102, student_id: 2, grade_value: '', comment: 'Заважав' } },
};
const subjects = [
  { id: 109, name: 'IT-англійська', active: true, url: 'x' },
  { id: 1, name: 'Алгебра', active: false, url: 'y' },
];
const journalHtml =
  `<html><body><journal-lessons-index :student_class="${esc({ id: 56, name: '8ІТ' })}" ` +
  `:subjects="${esc(subjects)}" :students="${esc(students)}" :list_lessons="${esc(lessons)}" ` +
  `:list_grades="${esc(grades)}" :selected_lesson="${esc({})}"></journal-lessons-index></body></html>`;

// ---- readProps ----
test('readProps: parses props without leading colon', () => {
  const p = core.readProps(journalHtml, 'journal-lessons-index');
  assert.deepEqual(p.student_class, { id: 56, name: '8ІТ' });
  assert.equal(p.students.length, 2);
  assert.equal(p.list_lessons[0].id, 100);
  assert.ok(!(':student_class' in p));
});

test('readProps: single-quoted string props (schedule page format)', () => {
  const html = `<schedule-teacher-index :selected_week="9" :teacher_id="'1867'" :teacher_name="'Іван О&#039;Брайен'"></schedule-teacher-index>`;
  const p = core.readProps(html, 'schedule-teacher-index');
  assert.equal(p.selected_week, 9);
  assert.equal(p.teacher_id, '1867');
  assert.equal(p.teacher_name, "Іван О'Брайен");
});

test('readProps: returns null when tag absent', () => {
  assert.equal(core.readProps('<html><body>hi</body></html>', 'journal-lessons-index'), null);
});

test('readProps: decodes &amp; &lt; &gt; &#039; &#39; entities', () => {
  const html = '<my-tag :a="{&quot;t&quot;:&quot;A &amp; B &lt;c&gt; it&#039;s &#39;x&#39;&quot;}"></my-tag>';
  const p = core.readProps(html, 'my-tag');
  assert.equal(p.a.t, "A & B <c> it's 'x'");
});

// ---- journalFromHtml ----
test('journalFromHtml: class and subject names', () => {
  const j = core.journalFromHtml(journalHtml);
  assert.equal(j.className, '8ІТ');
  assert.equal(j.subjectName, 'IT-англійська');
});

test('journalFromHtml: students reduced to {id,name}', () => {
  const j = core.journalFromHtml(journalHtml);
  assert.deepEqual(j.students, [
    { id: 1, name: 'Тестенко Аня' },
    { id: 2, name: 'Зразок Богдан' },
  ]);
});

test('journalFromHtml: lessons get date from url, special, canceled, needsDetails', () => {
  const j = core.journalFromHtml(journalHtml);
  assert.equal(j.lessons.length, 3);
  const [a, b, c] = j.lessons;
  assert.equal(a.id, 100);
  assert.equal(a.date, '2026-10-21');
  assert.equal(a.url, `${BASE}/56/109/2026-10-21/6`);
  assert.equal(a.special, '');
  assert.equal(a.canceled, false);
  assert.equal(a.needsDetails, true);
  assert.equal(b.date, '2026-10-22');
  assert.equal(b.special, 'Зошит');
  assert.equal(b.canceled, true);
  assert.equal(b.needsDetails, false);
  assert.equal(c.needsDetails, true);
});

test('journalFromHtml: grades normalized to {type,value,comment}', () => {
  const j = core.journalFromHtml(journalHtml);
  assert.deepEqual(j.grades[100][1], { type: 'grade', value: '11', comment: '' });
  assert.deepEqual(j.grades[100][2], { type: 'mark', value: 'Н', comment: '' });
  assert.deepEqual(j.grades[102][2], { type: 'comment', value: '', comment: 'Заважав' });
});

test('journalFromHtml: subject name from selected_subject when absent from subjects list', () => {
  const html =
    `<journal-lessons-index :student_class="${esc({ id: 64, name: '10IT' })}" ` +
    `:subjects="${esc([{ id: 1, name: 'Алгебра', active: false }])}" :students="[]" :list_lessons="[]" ` +
    `:list_grades="[]" :selected_subject="${esc({ id: 109, name: 'IT-англійська', active: true })}"></journal-lessons-index>`;
  assert.equal(core.journalFromHtml(html).subjectName, 'IT-англійська');
});

test('journalFromHtml: throws NOT_A_JOURNAL when students/grades props are unparseable', () => {
  const html = `<journal-lessons-index :students="{broken" :list_lessons="[]" :list_grades="[]"></journal-lessons-index>`;
  assert.throws(() => core.journalFromHtml(html), /NOT_A_JOURNAL/);
});

test('buildSheets: sheet names unique case-insensitively', () => {
  const mk = (className) => ({ className, subjectName: 'Алгебра', students: [], lessons: [], grades: {} });
  const names = core.buildSheets([mk('5-а'), mk('5-А')]).map((s) => s.name);
  assert.deepEqual(names, ['5-а Алгебра', '5-А Алгебра (2)', 'Усі записи']);
});

test('journalFromHtml: throws NOT_A_JOURNAL without element', () => {
  assert.throws(() => core.journalFromHtml('<html></html>'), (e) => e instanceof Error && /NOT_A_JOURNAL/.test(e.message));
});

// ---- lessonDetailsFromHtml ----
test('lessonDetailsFromHtml: reads topic and homework', () => {
  const html = `<journal-lessons-index :selected_lesson="${esc({ id: 1, topic: 'Linear search', homework: 'Ex. 3' })}"></journal-lessons-index>`;
  assert.deepEqual(core.lessonDetailsFromHtml(html), { topic: 'Linear search', homework: 'Ex. 3' });
});

test('lessonDetailsFromHtml: missing element gives empty strings', () => {
  assert.deepEqual(core.lessonDetailsFromHtml('<p>nothing</p>'), { topic: '', homework: '' });
});

test('lessonDetailsFromHtml: missing fields give empty strings', () => {
  const html = `<journal-lessons-index :selected_lesson="${esc({ id: 1, topic: 'Only topic' })}"></journal-lessons-index>`;
  assert.deepEqual(core.lessonDetailsFromHtml(html), { topic: 'Only topic', homework: '' });
});

// ---- journalKeysFromSchedule ----
test('journalKeysFromSchedule: unique keys in order of first appearance', () => {
  const weeks = [
    { week_days: [
      { date: '19.10.2026', lessons: {
        4: [{ subject_name: 'A', class_name: 'c', url: `${BASE}/56/117/2026-10-19/4` }],
        6: [{ subject_name: 'B', class_name: 'c', url: `${BASE}/56/109/2026-10-19/6` }],
      } },
      { date: '20.10.2026', lessons: {
        1: [{ subject_name: 'A', class_name: 'c', url: `${BASE}/56/117/2026-10-20/1` }],
      } },
    ] },
    { week_days: [
      { date: '26.10.2026', lessons: { 2: [{ url: `${BASE}/57/109/2026-10-26/2` }] } },
    ] },
  ];
  assert.deepEqual(core.journalKeysFromSchedule(weeks), ['56/117', '56/109', '57/109']);
});

test('journalKeysFromSchedule: holiday weeks and empty input', () => {
  assert.deepEqual(core.journalKeysFromSchedule([{ week_days: [] }]), []);
  assert.deepEqual(core.journalKeysFromSchedule([]), []);
});

// ---- schoolYearStart ----
test('schoolYearStart: month >= 9 uses current year', () => {
  assert.equal(core.schoolYearStart(new Date(2026, 8, 1)), '2026-09-01');
  assert.equal(core.schoolYearStart(new Date(2026, 9, 28)), '2026-09-01');
  assert.equal(core.schoolYearStart(new Date(2026, 11, 31)), '2026-09-01');
});

test('schoolYearStart: month < 9 uses previous year', () => {
  assert.equal(core.schoolYearStart(new Date(2027, 0, 15)), '2026-09-01');
  assert.equal(core.schoolYearStart(new Date(2027, 7, 31)), '2026-09-01');
});

// ---- inPeriod ----
test('inPeriod: inclusive bounds', () => {
  const ls = [{ date: '2026-10-01' }, { date: '2026-10-15' }, { date: '2026-10-31' }, { date: '2026-11-01' }, { date: '2026-09-30' }];
  const r = core.inPeriod(ls, '2026-10-01', '2026-10-31');
  assert.deepEqual(r.map((l) => l.date), ['2026-10-01', '2026-10-15', '2026-10-31']);
});

test('inPeriod: empty result and empty input', () => {
  assert.deepEqual(core.inPeriod([{ date: '2026-01-01' }], '2026-10-01', '2026-10-31'), []);
  assert.deepEqual(core.inPeriod([], '2026-10-01', '2026-10-31'), []);
});

// ---- buildSheets ----
const journal = {
  className: '8ІТ',
  subjectName: 'IT-англійська',
  students: [{ id: 1, name: 'Тестенко Аня' }, { id: 2, name: 'Зразок Богдан' }],
  lessons: [
    { id: 100, date: '2026-10-21', title: '', special: '', canceled: false, url: 'u', needsDetails: true },
    { id: 101, date: '2026-10-22', title: '', special: 'Зошит', canceled: true, url: 'u', needsDetails: false },
    { id: 102, date: '2026-10-23', title: '', special: '', canceled: false, url: 'u', needsDetails: true },
  ],
  grades: {
    100: { 1: { type: 'grade', value: '11', comment: '' }, 2: { type: 'mark', value: 'Н', comment: '' } },
    102: { 2: { type: 'comment', value: '', comment: 'Заважав' } },
  },
  details: { 100: { topic: 'Linear search', homework: 'Ex. 3' } },
};

test('buildSheets: grid sheet plus final "Усі записи"', () => {
  const sheets = core.buildSheets([journal]);
  assert.equal(sheets.length, 2);
  assert.equal(sheets[0].name, '8ІТ IT-англійська');
  assert.equal(sheets[1].name, 'Усі записи');
});

test('buildSheets: grid header, topic, homework rows', () => {
  const rows = core.buildSheets([journal])[0].rows;
  assert.deepEqual(rows[0], ['№', 'Учень', '21.10.2026', '22.10.2026 Зошит (скасовано)', '23.10.2026']);
  assert.deepEqual(rows[1], ['', 'Тема', 'Linear search', '', '']);
  assert.deepEqual(rows[2], ['', 'ДЗ', 'Ex. 3', '', '']);
});

test('buildSheets: student rows with numeric, Н, and null cells', () => {
  const rows = core.buildSheets([journal])[0].rows;
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[3], [1, 'Тестенко Аня', 11, null, null]);
  assert.deepEqual(rows[4], [2, 'Зразок Богдан', 'Н', null, null]);
});

test('buildSheets: works without details', () => {
  const j = { ...journal };
  delete j.details;
  const rows = core.buildSheets([j])[0].rows;
  assert.equal(rows[1][1], 'Тема');
  assert.equal(rows[1].length, 5);
  assert.equal(rows[3][2], 11);
});

test('buildSheets: "Усі записи" lists every grade entry of any type', () => {
  const rows = core.buildSheets([journal])[1].rows;
  assert.deepEqual(rows[0], ['Клас', 'Предмет', 'Дата', 'Учень', 'Тип', 'Оцінка', 'Коментар']);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[1], ['8ІТ', 'IT-англійська', '21.10.2026', 'Тестенко Аня', 'оцінка', 11, '']);
  assert.deepEqual(rows[2], ['8ІТ', 'IT-англійська', '21.10.2026', 'Зразок Богдан', 'відмітка', 'Н', '']);
  assert.deepEqual(rows[3], ['8ІТ', 'IT-англійська', '23.10.2026', 'Зразок Богдан', 'коментар', '', 'Заважав']);
});

test('buildSheets: sheet names sanitized, truncated to 31, unique', () => {
  const bad = { ...journal, className: '8[A]:*?/\\', subjectName: 'X'.repeat(60) };
  const sheets = core.buildSheets([bad, { ...bad }, journal, { ...journal }]);
  const names = sheets.map((s) => s.name);
  for (const n of names) {
    assert.ok(n.length <= 31, `too long: ${n}`);
    assert.ok(!/[\[\]:*?/\\]/.test(n), `bad char: ${n}`);
  }
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes('8ІТ IT-англійська (2)'));
});

test('buildSheets: no lessons gives header rows only', () => {
  const empty = { ...journal, lessons: [], grades: {}, details: {} };
  const rows = core.buildSheets([empty])[0].rows;
  assert.deepEqual(rows[0], ['№', 'Учень']);
  assert.deepEqual(rows[1], ['', 'Тема']);
  assert.deepEqual(rows[2], ['', 'ДЗ']);
});
