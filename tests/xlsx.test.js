'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeXlsx } = require('../src/xlsx.js');

const sheets = [
  { name: 'Клас А', rows: [['№', 'Учень', 'Дата'], [1, 'Тестенко & Син', 11], [2, 'Зразок', null]] },
  { name: 'Усі записи', rows: [['Клас', 'Оцінка'], ['8ІТ', 'Н']] },
];

const out = makeXlsx(sheets);
const buf = Buffer.from(out);
const latin = buf.toString('latin1');
const utf = buf.toString('utf8');

const countSig = (sig) => {
  let n = 0, i = -1;
  while ((i = buf.indexOf(sig, i + 1)) !== -1) n++;
  return n;
};

test('makeXlsx: returns Uint8Array starting with zip local header', () => {
  assert.ok(out instanceof Uint8Array);
  assert.deepEqual([...out.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
});

test('makeXlsx: contains required part names', () => {
  for (const n of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
    assert.ok(latin.includes(n), `missing ${n}`);
  }
});

test('makeXlsx: contains sheet names and Cyrillic cell text (stored, uncompressed)', () => {
  assert.ok(utf.includes('Клас А'));
  assert.ok(utf.includes('Усі записи'));
  assert.ok(utf.includes('Зразок'));
});

test('makeXlsx: XML-escapes ampersand in values', () => {
  assert.ok(utf.includes('Тестенко &amp; Син'));
  assert.ok(!utf.includes('Тестенко & Син'));
});

test('makeXlsx: numeric cell written as <v>11</v>', () => {
  assert.ok(utf.includes('<v>11</v>'));
});

test('makeXlsx: end-of-central-directory entry count equals file count', () => {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0, 'no EOCD');
  const total = buf.readUInt16LE(eocd + 10);
  assert.equal(total, countSig(Buffer.from([0x50, 0x4b, 0x03, 0x04])));
  assert.equal(total, countSig(Buffer.from([0x50, 0x4b, 0x01, 0x02])));
  assert.ok(total >= 4);
});

test('makeXlsx: entries are STORED (compression method 0)', () => {
  assert.equal(buf.readUInt16LE(8), 0);
});
