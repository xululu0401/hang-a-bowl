/* 挂一碗面 · 核心测试：node --test tests/core.test.cjs
 * 锚点：tests/ref.json（独立 Python：联合状态字典 + lgamma 泊松 + 逐个往上试，300 组 + 40 组要挂多少 + 5 组闭式）、
 *       默认场景读数、守恒、单调性、边界与非法输入。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const A = require(path.join(__dirname, '..', 'core.js'));
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'ref.json'), 'utf8'));
const S = (o) => Object.assign(A.defaultState(), o || {});
const close = (x, y, tol, msg) => assert.ok(Math.abs(x - y) <= tol, msg + '：' + x + ' vs ' + y);

test('默认场景：读数、标题与改法', () => {
  const o = A.compute(A.defaultState());
  assert.ok(o.ok, JSON.stringify(o.errors));
  close(o.pNone, 0.441602, 5e-6, '30 天一天不断');
  assert.equal(o.medFirst, 28); assert.equal(o.needS0, 106); assert.equal(o.level, 'short'); /* 44.2% < 50% */
  close(o.R.Eturn, 15.4478, 1e-3, '空手人次'); close(o.R.Eend, 15.4478, 1e-3, '最后剩下');
  close(o.R.EoutDays, 2.8, 0.05, '断碗天数');
  assert.equal(A.headline(o), '30 天里一天都不断碗的把握是 44.2%：有一半的可能，到第 28 天就已经断过一次。');
  assert.equal(A.verdict(o), '想要 90% 的把握，开张至少要挂 106 碗，先垫 1,590 元，比现在多 46 碗。');
  assert.deepEqual(o.actions.map((a) => a.id), ['actS0', 'actGive', 'actCap']);
  assert.ok(o.actions[0].text.indexOf('多挂 46 碗，多垫 690 元') > 0, o.actions[0].text);
  assert.ok(o.actions[0].pNone >= 0.9, '改法真的达到 90%');
  assert.equal(o.needGive, 19.8); assert.ok(o.actions[1].pNone >= 0.9);
  /* 第 1 天：墙上 60 + 挂进，来领 ~泊松(20) → 断碗概率极小；越往后越大 */
  assert.ok(o.day[0].pOut < 1e-9 && o.day[29].pOut > o.day[9].pOut);
  /* 105 碗不够、106 碗够（最少性） */
  assert.ok(A.run(105, 18, 20, 30, 0, false).pNone < 0.9 && A.run(106, 18, 20, 30, 0, false).pNone >= 0.9);
});

test('与独立 Python 参考逐组对拍（300 组）', () => {
  assert.equal(REF.cases.length, 300);
  let mid = 0;
  for (const r of REF.cases) {
    const R = A.run(r.s0, r.give, r.take, r.days, r.cap, true);
    const m = JSON.stringify(r);
    close(R.pNone, r.pNone, 1e-9, m + ' pNone');
    close(R.Eturn, r.Eturn, 1e-7, m + ' 空手'); close(R.Ecap, r.Ecap, 1e-7, m + ' 上限');
    close(R.Eserved, r.Eserved, 1e-7, m + ' 送出'); close(R.Eend, r.Eend, 1e-7, m + ' 剩下');
    close(R.EoutDays, r.EoutDays, 1e-9, m + ' 断碗天数');
    if (r.pNone > 0.02 && r.pNone < 0.98) mid++;
  }
  assert.ok(mid >= 100, '中间把握的样本太少：' + mid);
});

test('要挂多少碗：与逐个往上试一致（40 组）', () => {
  for (const r of REF.needs) {
    const v = A.needS0({ give: r.give, take: r.take, days: r.days, cap: r.cap }, r.q);
    assert.equal(v, r.need, JSON.stringify(r));
  }
});

test('闭式锚点：没人来挂、不设上限 = 泊松累计', () => {
  for (const c of REF.closed) close(A.run(c.s0, 0, c.take, c.days, 0, true).pNone, c.cdf, 1e-12, JSON.stringify(c));
});

test('守恒：送出 + 剩下 = 开张 + 挂进；送出 + 空手 + 挡回 = 来领', () => {
  for (const [s0, g, t, d, c] of [[60, 18, 20, 30, 0], [0, 0, 5, 10, 0], [5, 30, 30, 60, 10], [2000, 60, 60, 60, 0], [10, 2, 9.5, 20, 3]]) {
    const R = A.run(s0, g, t, d, c, true);
    close(R.Eserved + R.Eend, s0 + g * d, 1e-6 * (s0 + g * d + 1), '碗守恒 ' + [s0, g, t, d, c]);
    close(R.Eserved + R.Eturn + R.Ecap, t * d, 1e-6 * (t * d + 1), '人守恒 ' + [s0, g, t, d, c]);
    assert.ok(R.dropped < 1e-12, '丢弃的概率 ' + R.dropped);
  }
});

test('单调性：多挂、来挂多、少算几天 → 把握不降；来领多 → 不升', () => {
  const base = [30, 4, 5, 15, 0];
  const p = (s0, g, t, d, c) => A.run(s0, g, t, d, c, false).pNone;
  const b = p(...base);
  assert.ok(p(31, 4, 5, 15, 0) >= b - 1e-12 && p(30, 4.5, 5, 15, 0) >= b - 1e-12 && p(30, 4, 5, 14, 0) >= b - 1e-12);
  assert.ok(p(30, 4, 5.5, 15, 0) <= b + 1e-12);
  /* 逐天：到这天还没断过 单调不增，且首次断碗之和 = 1 − 一天不断 */
  const R = A.run(...base, true); let prev = 1, sum = 0;
  R.day.forEach((d) => { assert.ok(d.pNone <= prev + 1e-15); prev = d.pNone; sum += d.firstOut; });
  close(sum, 1 - R.pNone, 1e-12, '首次断碗之和');
});

test('每天上限：被挡回的不算断碗；上限够低时再也不会断', () => {
  /* 上限 1 碗、开张 30 碗、10 天：每天最多送 1 碗，30 碗用不完 → 一定不断，但来领的大多被挡回 */
  const R = A.run(30, 0, 5, 10, 1, true);
  assert.equal(R.pNone, 1); assert.equal(R.Eturn, 0); close(R.Ecap, 50 - 10 * (1 - Math.exp(-5)), 1e-9, '挡回人次');
  /* 墙上 0 碗、上限 3：来领的人里 ≤3 的部分没领到才算断碗 */
  const o = A.compute(S({ s0: '0', give: '0', take: '2', days: '1', cap: '3' }));
  close(o.pNone, Math.exp(-2), 1e-12, '没人来领才不断');
  assert.deepEqual(o.actions.map((a) => a.id).indexOf('actNoCap') >= 0, true);
  /* 已经设了上限：只给「不设上限」，不再给「每天最多送几碗」 */
  const c = A.compute(S({ cap: '15' })); assert.ok(A.explain(c).indexOf('平均撑') < 0 && A.explain(c).indexOf('但每天最多送 15 碗') > 0, A.explain(c)); assert.ok(c.actions.every((a) => a.id !== 'actCap'), JSON.stringify(c.actions.map((a) => a.id)));
});

test('没人来领：nobody，不给改法', () => {
  const o = A.compute(S({ take: '0' }));
  assert.equal(o.level, 'nobody'); assert.equal(o.pNone, 1); assert.deepEqual(o.actions, []);
  assert.equal(A.headline(o), '没有人来领，墙上的 60 碗一碗也送不出去。'); assert.equal(A.verdict(o), '');
});

test('已经够：safe，改法给「少挂也够」且同样达到把握', () => {
  const o = A.compute(S({ give: '25' }));
  assert.equal(o.level, 'safe'); assert.equal(o.needS0, 6);
  assert.ok(A.headline(o).endsWith('，够了。'));
  assert.equal(o.actions[0].id, 'actS0'); assert.ok(o.actions[0].text.indexOf('少挂 54 碗，少垫 810 元') > 0, o.actions[0].text);
  assert.ok(o.actions[0].pNone >= 0.9 && A.run(5, 25, 20, 30, 0, false).pNone < 0.9);
});

test('怎么挂都不够：needS0 = null，文案说到不了', () => {
  /* 每天来领 60、挂 0、60 天：总共来领 ~泊松(3600)，99.9% 要约 3600 + 3.09×60 ≈ 3787 碗，超过输入上限 2000 → null */
  const P = { give: 0, take: 60, days: 60, cap: 0 };
  assert.equal(A.needS0(P, 0.999), null); assert.equal(A.SEARCH_S0, A.MAX_S0);
  assert.equal(A.needS0({ give: 0, take: 30, days: 60, cap: 0 }, 0.999), 1933); /* Python 泊松(1800) 累计到 1933 首次 ≥ 0.999（独立核对，见 evidence） */
  const o = A.compute(S({ give: '0', take: '60', days: '60', s0: '2000', q: '99.9' }));
  assert.equal(o.needS0, null); assert.equal(o.level, 'short');
  assert.ok(A.verdict(o).indexOf('挂到 2,000 碗也到不了 99.9% 的把握') > 0, A.verdict(o));
  assert.ok(o.actions.every((a) => a.id !== 'actS0'));
});

test('非法输入：逐项报错', () => {
  const bad = A.compute(S({ s0: '1.5', take: 'abc', give: '-1', days: '0', cap: '201', q: '40', price: '' }));
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.errors.map((e) => e.field).sort(), ['cap', 'days', 'give', 'price', 's0', 'take', 'q'].sort());
  assert.equal(A.compute(S({ take: '2.25' })).errors[0].field, 'take');
  assert.equal(A.compute(S({ give: '1.05' })).errors[0].field, 'give');
  /* 全角数字与千分位能读 */
  const o = A.compute(S({ s0: '１,０００', take: '２０' })); assert.ok(o.ok); assert.equal(o.P.s0, 1000); assert.equal(o.P.take, 20);
});

test('边界：开张 0 碗、算 1 天、把握 50% 与 99.9%、上限 200', () => {
  const o = A.compute(S({ s0: '0', give: '0', take: '1', days: '1' }));
  close(o.pNone, Math.exp(-1), 1e-12, '0 碗 1 天'); assert.equal(o.needS0, 2); /* P(B≤2)=0.9197 ≥ 0.9，P(B≤1)=0.7358 < 0.9 → 2 碗 */
  assert.equal(A.headline(o).indexOf('这一天不断碗的把握是 36.8%'), 0, A.headline(o));
  /* 已经够了就不再建议设每天上限（挡人换不来更多把握） */
  assert.ok(A.compute(S({ days: '1' })).actions.every((a) => a.id !== 'actCap'));
  assert.equal(A.compute(S({ q: '50' })).ok, true); assert.equal(A.compute(S({ q: '99.9' })).ok, true);
  assert.equal(A.compute(S({ cap: '200' })).ok, true);
  assert.equal(A.needS0({ give: 0, take: 1, days: 1, cap: 0 }, 0.5), 1); /* P(B≤0)=0.368 < 0.5 */
});

test('格式：把握、金额、人次', () => {
  assert.equal(A.pct(1), '≈100%'); assert.equal(A.pct(0), '≈0%'); assert.equal(A.pct(0.441602), '44.2%');
  assert.equal(A.pct(0.0004), '不到 0.1%'); assert.equal(A.pct(1e-20), '不到 0.1%'); assert.equal(A.pct(0.99999), '99.999%'); assert.equal(A.pct(0.9996), '99.96%');
  assert.equal(A.pct(1 - 1e-12), '99.9999%'); /* 向下截，不会显示成 100% */ assert.equal(A.pct(0.9), '90%');
  assert.equal(A.yuan(1590), '1,590'); assert.equal(A.yuan(1309.1), '1,309'); /* 千元以上取整 */ assert.equal(A.yuan(7.5), '7.5'); assert.equal(A.hh1(0.04), '不到 0.1'); assert.equal(A.hh1(0), '0');
  assert.equal(A.hh1(157.51), '158'); assert.equal(A.hh1(15.44), '15.4');
});

test('导出：CSV 防公式注入、行数、MD 含标题与表', () => {
  const o = A.compute(S({ place: '=HYPERLINK("x")' }));
  const csv = A.toCSV(o, '2026-11-17 13:00');
  assert.ok(csv.indexOf('"\'=HYPERLINK(""x"")"') > 0, '地点被转义');
  assert.equal(csv.split('\r\n').filter(Boolean).length, 1 + 30 + 9); /* 表头 + 30 天 + 9 行设定（空行被 filter 掉） */
  const md = A.toMD(A.compute(A.defaultState()), 'w');
  assert.ok(md.indexOf('**30 天里一天都不断碗的把握是 44.2%') > 0 && md.indexOf('| 30 | ') > 0 && md.indexOf('虚构示例') > 0);
});
