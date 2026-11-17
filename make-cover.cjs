/* 封面 cover.svg（1200×1200），读数来自 core.js 同一次 compute；再用浏览器截成 cover.png。 */
const fs = require('node:fs');
const A = require('./core.js');
const o = A.compute(A.defaultState());
if (!o.ok || A.pct(o.pNone) !== '44.2%' || o.needS0 !== 106) throw new Error('默认场景不对');
const F = "-apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
let bowls = '';
for (let i = 0; i < 60; i++) { const c = i % 15, r = Math.floor(i / 15), x = 140 + c * 62, y = 360 + r * 74; bowls += `<rect x="${x}" y="${y}" width="46" height="58" rx="4" fill="#fff8e8" stroke="#d3bb8c" stroke-width="2"/><line x1="${x + 10}" x2="${x + 36}" y1="${y + 24}" y2="${y + 24}" stroke="#d8c39a" stroke-width="4"/>`; }
const heat = (p) => p < 0.01 ? '#ffffff' : p < 0.1 ? '#f8dcc2' : p < 0.3 ? '#ecaa86' : '#cf6a4c';
let cal = '';
o.day.forEach((d, i) => { const c = i % 15, r = Math.floor(i / 15), x = 140 + c * 62, y = 720 + r * 74; cal += `<rect x="${x}" y="${y}" width="56" height="62" rx="5" fill="${heat(d.pOut)}" stroke="#e2d8c8" stroke-width="2"/><text x="${x + 28}" y="${y + 41}" font-family="${F}" font-size="24" font-weight="700" fill="${d.pOut >= 0.3 ? '#fff' : '#5a4f46'}" text-anchor="middle">${d.t}</text>`; });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="#f4efe6"/>
  <rect x="60" y="60" width="1080" height="1080" rx="18" fill="#fffdf8"/>
  <text x="140" y="215" font-family="${F}" font-size="124" font-weight="800" fill="#2a2420">挂一碗面</text>
  <text x="140" y="290" font-family="${F}" font-size="40" fill="#5a4f46">墙上先挂多少碗，这个月才不断</text>
  <rect x="120" y="340" width="960" height="320" rx="10" fill="#efe3cc"/>
  ${bowls}
  <text x="1060" y="690" font-family="${F}" font-size="28" fill="#8a7e72" text-anchor="end">开张 60 碗 · 每天来领 20 · 挂进 18</text>
  ${cal}
  <text x="140" y="960" font-family="${F}" font-size="30" fill="#5a4f46">30 天一天都不断</text>
  <text x="140" y="1040" font-family="${F}" font-size="76" font-weight="800" fill="#b5402f">${A.pct(o.pNone)}</text>
  <text x="620" y="960" font-family="${F}" font-size="30" fill="#5a4f46">要九成把握，开张挂</text>
  <text x="620" y="1040" font-family="${F}" font-size="76" font-weight="800" fill="#8a4b12">${o.needS0} 碗</text>
  <text x="140" y="1105" font-family="${F}" font-size="24" fill="#8a7e72">泊松概率模型逐天精确推算 · 店铺与数字为虚构示例</text>
</svg>`;
fs.writeFileSync('cover.svg', svg);
fs.writeFileSync('/tmp/cover95.html', '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0}</style></head><body>' + svg + '</body></html>');
console.log('cover.svg', svg.length);
