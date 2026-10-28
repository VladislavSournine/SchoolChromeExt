# Journal export — design & contract

## Capability
A teacher logged into any `*.academy.com.ua` school site clicks «Експорт журналів» and gets one
`.xlsx` with every journal they teach (or only the open one), covering lessons from 1 Sept of the
current school year up to today: grades, «Н», comments, lesson topic and homework.

## Design
- MV3 extension, content script only (runs in the site origin → session cookies, no popup that
  dies mid-export). Floating button → panel: «Цей журнал» (only on `/journal/...`) / «Усі мої журнали», progress.
- Discovery: `/schedule/teacher` → `:teacher_id`, `:selected_week`; then
  `/schedule/teacher/get/{id}/{w}` for w = 1..selected_week; unique `/journal/{class}/{subject}/` keys
  from lesson `url`s (holiday weeks are simply empty).
- Journal data: `/journal/{class}/{subject}/nearest/{today}` → JSON props of `<journal-lessons-index>`.
- Topic/HW: per lesson with `have_topic || have_homework` → lesson page `:selected_lesson.topic/homework`
  (sequential, 150 ms pause).
- Output: own minimal XLSX writer (no vendored lib). Sheet per journal (grid) + sheet «Усі записи» (flat).

## Contract (src/core.js, src/xlsx.js — pure, Node-testable)
```
readProps(html, tag) -> {[propName]: parsedJSON} | null          // tag absent -> null
journalFromHtml(html) -> {className, subjectName, students[{id,name}],
                          lessons[{id,date:'YYYY-MM-DD',title,special,canceled,url,needsDetails}],
                          grades{[lessonId]:{[studentId]:{type,value,comment}}}}  // throws 'NOT_A_JOURNAL'
lessonDetailsFromHtml(html) -> {topic, homework}                  // missing -> ''
journalKeysFromSchedule(weeks[]) -> ['56/109', ...]               // unique, order of first appearance
schoolYearStart(today) -> 'YYYY-09-01' (month<9 -> previous year)
inPeriod(lessons, from, to) -> lessons with from <= date <= to
buildSheets(journals) -> [{name, rows: (string|number|null)[][]}]  // names <=31 chars, unique, no []:*?/\
makeXlsx(sheets) -> Uint8Array (zip, stored)
```
Example: grades `{268299:{1138:{type:'grade',value:'11'}}}` → cell `11` (number); `{type:'mark',value:'Н'}` → `Н`;
grade + comment → grid cell `11`, comment in «Усі записи».

Errors / edges: not logged in (redirect to `/auth`) → panel message «Увійдіть у систему»; no lessons in period →
sheet with header only; HTTP error on one lesson page → topic left blank, export continues, count reported;
canceled lesson → header suffix «(скасовано)»; duplicate sheet names → « (2)» suffix.
