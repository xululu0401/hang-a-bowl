/* 挂一碗面 · 计算核心（core.js）
 * 问题：一家店开「挂一碗」（有人先付钱挂在墙上，没钱的人来了直接领一碗）。墙上先挂了几碗，
 *       每天有人来挂、有人来领，来的人数天天不一样。这一段日子里会不会哪天碗被领光、有人空手回去？
 *       开张要先挂多少碗才有几成把握一天都不断？每天平均要有几个人来挂？
 * 模型（设计选择，页面「怎么算的」里写明，不是对任何真实店铺的预测）：
 *   - 每天来挂的碗数 A ~ 泊松(λ挂)，来领的人数 B ~ 泊松(λ领)，每人领一碗，天与天之间互不影响。
 *   - 当天挂的当天就能领（先挂后领）。墙上这时有 Y = 昨天剩下 + A 碗。
 *   - 每天最多送 m 碗（m = 0 表示不限）。送出 = min(Y, B, m)，剩下 = Y − 送出。
 *   - 「断碗」= 当天有人来领，但墙上的碗不够（Y < B 且 Y < m）：碗送完了，后面的人空手回去。
 *     因为每天上限挡回去的人单独记，不算断碗。
 *   - 精确计算：按「墙上剩几碗」的概率分布逐天推下去（不是随机模拟）；尾部概率小于 1e-17 的格子丢弃，丢掉的总量另记。
 * 独立参考：tests/ref.py 用逐对 (A, B) 枚举的另一种写法对拍；无人来挂时与「总人数 ≤ 起始碗数」的泊松闭式对照。 */
(function (root) {
  'use strict';
  var MAX_DAYS = 60, MAX_RATE = 60, MAX_S0 = 2000, MAX_CAP = 200, SEARCH_S0 = 2000 /* = MAX_S0：改法按钮填回输入框，不能超过输入上限 */, CUT = 1e-17, EPS = 1e-12;

  function defaultState() {
    return { place: '巷口一家面馆', price: '15', s0: '60', take: '20', give: '18', days: '30', cap: '0', q: '90' };
  }

  function half(s) { return String(s == null ? '' : s).replace(/[\uFF01-\uFF5E]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); }).replace(/\u3000/g, ' ').replace(/[,，\s]/g, ''); }
  function num(s) { s = half(s).replace(/。/g, '.'); if (/^\d+(\.\d+)?$/.test(s)) return Number(s); if (/^-\d+(\.\d+)?$/.test(s)) return Number(s); return NaN; }
  function isInt(x) { return isFinite(x) && Math.floor(x) === x; }

  function parse(st) {
    var errs = [], P = { place: String(st.place == null ? '' : st.place).trim().slice(0, 30) };
    function need(f, lo, hi, intOnly, msg) {
      var v = num(st[f]);
      if (!isFinite(v)) { errs.push({ field: f, message: msg + '：要填数字' }); return NaN; }
      if (intOnly && !isInt(v)) { errs.push({ field: f, message: msg + '：要填整数' }); return NaN; }
      if (v < lo || v > hi) { errs.push({ field: f, message: msg + '：要在 ' + lo + '–' + hi + ' 之间' }); return NaN; }
      return v;
    }
    P.price = need('price', 0, 1000, false, '一碗多少钱');
    P.s0 = need('s0', 0, MAX_S0, true, '开张时墙上挂了几碗');
    P.take = need('take', 0, MAX_RATE, false, '每天平均几个人来领');
    P.give = need('give', 0, MAX_RATE, false, '每天平均挂几碗');
    P.days = need('days', 1, MAX_DAYS, true, '算几天');
    P.cap = need('cap', 0, MAX_CAP, true, '每天最多送几碗（0 = 不限）');
    P.q = need('q', 50, 99.9, false, '想要几成把握');
    if (!errs.length && P.take > 0 && P.take * 10 % 1 > EPS) errs.push({ field: 'take', message: '每天平均几个人来领：最多一位小数' });
    if (!errs.length && P.give * 10 % 1 > EPS) errs.push({ field: 'give', message: '每天平均挂几碗：最多一位小数' });
    return { P: P, errors: errs };
  }

  /* 泊松分布，截到尾部 < 1e-15；λ = 0 时是 0 的点分布 */
  var pcache = {};
  function poisson(lam) {
    var key = String(lam); if (pcache[key]) return pcache[key];
    var p = [Math.exp(-lam)], cum = p[0], k = 0;
    while (1 - cum > 1e-15 || k < lam) { k++; p.push(p[k - 1] * lam / k); cum += p[k]; if (k > 400) break; }
    var a = new Float64Array(p); pcache[key] = a; return a;
  }

  /* 逐天推墙上碗数的分布。full=false 时只推「到今天为止从没断过」那部分（找最少碗数时用）。 */
  function run(s0, give, take, days, cap, full) {
    var A = poisson(give), B = poisson(take), mCap = cap > 0 ? cap : Infinity;
    var size = s0 + 1, f = new Float64Array(size), g = new Float64Array(size);
    f[s0] = 1; g[s0] = 1;
    var flo = s0, fhi = s0, glo = s0, ghi = s0, dropped = 0;
    var day = [], pNone = 1;
    var Eserved = 0, Eturn = 0, Ecap = 0, EoutDays = 0;
    for (var t = 1; t <= days; t++) {
      var need = Math.max(fhi, ghi) + A.length;
      if (need > size) { size = Math.max(need, size * 2); var f2 = new Float64Array(size), g2 = new Float64Array(size); f2.set(f); g2.set(g); f = f2; g = g2; }
      /* 1) 先挂：Y = 剩下 + A */
      function conv(src, lo, hi) {
        var y = new Float64Array(size), nlo = lo, nhi = hi + A.length - 1;
        for (var x = lo; x <= hi; x++) { var px = src[x]; if (!px) continue; for (var a = 0; a < A.length; a++) y[x + a] += px * A[a]; }
        return { y: y, lo: nlo, hi: nhi };
      }
      var dayOut = 0, dayTurn = 0, dayCap = 0, dayServed = 0, firstOut = 0, Eleft = 0;
      if (full) {
        var Y = conv(f, flo, fhi), nf = new Float64Array(size), lo2 = Infinity, hi2 = -1;
        for (var y = Y.lo; y <= Y.hi; y++) {
          var py = Y.y[y]; if (!py) continue;
          var lim = Math.min(y, mCap);
          for (var b = 0; b < B.length; b++) {
            var pr = py * B[b]; if (!pr) continue;
            var sv = Math.min(lim, b), nx = y - sv;
            nf[nx] += pr; dayServed += pr * sv;
            /* 想领的人里，超过每天上限的算「被上限挡回」；上限以内却没领到的算「空手回去」（断碗） */
            var want = Math.min(b, mCap);
            if (b > want) dayCap += pr * (b - want);
            if (want > sv) { dayOut += pr; dayTurn += pr * (want - sv); }
          }
        }
        for (var z = 0; z < size; z++) if (nf[z]) { if (z < lo2) lo2 = z; hi2 = z; }
        var tr = trim(nf, lo2, hi2); dropped += tr.d; f = nf; flo = tr.lo; fhi = tr.hi;
        for (var w = flo; w <= fhi; w++) Eleft += f[w] * w;
      }
      /* 2) 只跟「从没断过」那部分 */
      var G = conv(g, glo, ghi), ng = new Float64Array(size), glo2 = Infinity, ghi2 = -1;
      for (var y2 = G.lo; y2 <= G.hi; y2++) {
        var qy = G.y[y2]; if (!qy) continue;
        var lim2 = Math.min(y2, mCap);
        for (var b2 = 0; b2 < B.length; b2++) {
          var q = qy * B[b2]; if (!q) continue;
          if (b2 > lim2 && y2 < mCap) { firstOut += q; continue; }
          ng[y2 - Math.min(lim2, b2)] += q;
        }
      }
      for (var z2 = 0; z2 < size; z2++) if (ng[z2]) { if (z2 < glo2) glo2 = z2; ghi2 = z2; }
      if (ghi2 < 0) { glo2 = 0; ghi2 = 0; }
      var tg = trim(ng, glo2, ghi2); dropped += tg.d; g = ng; glo = tg.lo; ghi = tg.hi;
      pNone -= firstOut;
      var row = { t: t, firstOut: firstOut, pNone: Math.max(0, pNone) };
      if (full) {
        row.pOut = dayOut; row.turn = dayTurn; row.capped = dayCap; row.served = dayServed; row.left = Eleft;
        Eserved += dayServed; Eturn += dayTurn; Ecap += dayCap; EoutDays += dayOut;
      }
      day.push(row);
    }
    var res = { day: day, pNone: Math.max(0, Math.min(1, pNone)), dropped: dropped };
    if (full) {
      res.Eserved = Eserved; res.Eturn = Eturn; res.Ecap = Ecap; res.EoutDays = EoutDays;
      var Eend = 0, cdf = 0, med = 0, found = false;
      for (var e = flo; e <= fhi; e++) { Eend += f[e] * e; cdf += f[e]; if (!found && cdf >= 0.5 - EPS) { med = e; found = true; } }
      res.Eend = Eend; res.medEnd = med; res.pEmptyEnd = flo === 0 ? f[0] : 0;
    }
    return res;
  }
  function trim(a, lo, hi) {
    var d = 0;
    if (hi < lo) return { lo: 0, hi: 0, d: 0 };
    while (lo < hi && a[lo] < CUT) { d += a[lo]; a[lo] = 0; lo++; }
    while (hi > lo && a[hi] < CUT) { d += a[hi]; a[hi] = 0; hi--; }
    return { lo: lo, hi: hi, d: d };
  }

  /* 要多少：起始碗数（整数，二分，单调性见 README）；每天挂几碗（0.1 一档，二分） */
  function needS0(P, q) {
    var ok = function (s) { return run(s, P.give, P.take, P.days, P.cap, false).pNone >= q - EPS; };
    if (ok(0)) return 0;
    if (!ok(SEARCH_S0)) return null;
    var lo = 0, hi = SEARCH_S0;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (ok(mid)) hi = mid; else lo = mid; }
    return hi;
  }
  function needGive(P, q) {
    var ok = function (tenth) { return run(P.s0, tenth / 10, P.take, P.days, P.cap, false).pNone >= q - EPS; };
    if (ok(0)) return 0;
    if (!ok(MAX_RATE * 10)) return null;
    var lo = 0, hi = MAX_RATE * 10;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (ok(mid)) hi = mid; else lo = mid; }
    return hi / 10;
  }

  function compute(st) {
    var pr = parse(st);
    if (pr.errors.length) return { ok: false, errors: pr.errors, P: pr.P };
    var P = pr.P, q = P.q / 100;
    var R = run(P.s0, P.give, P.take, P.days, P.cap, true);
    var o = { ok: true, errors: [], P: P, q: q, R: R, day: R.day, pNone: R.pNone };
    o.drift = P.give - P.take;
    /* 首次断碗：一半把握之前（中位）、最可能哪天 */
    var cum = 0; o.medFirst = null; o.peakDay = null; var pk = -1;
    R.day.forEach(function (d) { cum += d.firstOut; if (o.medFirst == null && cum >= 0.5 - EPS) o.medFirst = d.t; if (d.firstOut > pk + EPS) { pk = d.firstOut; o.peakDay = d.t; } });
    if (pk < 1e-9) o.peakDay = null;
    o.firstDayRisky = null; for (var i = 0; i < R.day.length; i++) if (R.day[i].pOut >= 0.1 - EPS) { o.firstDayRisky = R.day[i].t; break; }
    o.needS0 = needS0(P, q);
    o.needGive = needGive(P, q);
    o.level = P.take === 0 ? 'nobody' : o.pNone >= q - EPS ? 'safe' : o.pNone >= 0.5 - EPS ? 'shaky' : 'short';
    /* 改法：每个都真的改一项输入、重算后把结果写进按钮 */
    var acts = [];
    function cf(ch) { var s = {}; ['place', 'price', 's0', 'take', 'give', 'days', 'cap', 'q'].forEach(function (k) { s[k] = String(st[k]); }); Object.keys(ch).forEach(function (k) { s[k] = String(ch[k]); }); var p2 = parse(s).P; return run(p2.s0, p2.give, p2.take, p2.days, p2.cap, true); }
    if (o.level !== 'nobody') {
      if (o.needS0 != null && o.needS0 !== P.s0) {
        var r1 = cf({ s0: o.needS0 });
        acts.push({ id: 'actS0', set: { s0: String(o.needS0) }, pNone: r1.pNone, label: '开张挂 ' + hh(o.needS0) + ' 碗',
          text: (o.needS0 > P.s0 ? '开张先挂 ' + hh(o.needS0) + ' 碗（多挂 ' + hh(o.needS0 - P.s0) + ' 碗' : '开张只挂 ' + hh(o.needS0) + ' 碗也够（少挂 ' + hh(P.s0 - o.needS0) + ' 碗') + (P.price > 0 ? '，' + (o.needS0 > P.s0 ? '多垫' : '少垫') + ' ' + yuan(Math.abs(o.needS0 - P.s0) * P.price) + ' 元' : '') + '）：' + P.days + ' 天一天不断的把握 ' + pct(r1.pNone) });
      }
      if (o.needGive != null && o.needGive > P.give + EPS) {
        var r2 = cf({ give: o.needGive });
        acts.push({ id: 'actGive', set: { give: fmt1(o.needGive) }, pNone: r2.pNone, label: '每天挂进 ' + fmt1(o.needGive) + ' 碗',
          text: '每天平均有 ' + fmt1(o.needGive) + ' 碗挂进来（现在 ' + fmt1(P.give) + '）：把握 ' + pct(r2.pNone) });
      }
      if (P.cap === 0 && o.level !== 'safe' && P.give < P.take - EPS && P.give >= 1) {
        var m = Math.max(1, Math.floor(P.give + EPS)), r3 = cf({ cap: m });
        acts.push({ id: 'actCap', set: { cap: String(m) }, pNone: r3.pNone, capped: r3.Ecap, label: '每天最多送 ' + m + ' 碗',
          text: '每天最多送 ' + m + ' 碗：一天不断的把握 ' + pct(r3.pNone) + '，代价是 ' + P.days + ' 天里平均 ' + hh1(r3.Ecap) + ' 人次被上限挡回去' });
      }
      if (P.cap > 0) {
        var r4 = cf({ cap: 0 });
        acts.push({ id: 'actNoCap', set: { cap: '0' }, pNone: r4.pNone, label: '不设每天上限',
          text: '不设每天上限：一天不断的把握 ' + pct(r4.pNone) + '，平均空手回去 ' + hh1(r4.Eturn) + ' 人次' });
      }
    }
    o.actions = acts;
    /* 对照表：现在 + 每个改法（同一次重算的结果） */
    function row(name, R0, cur) { return { name: name, cur: !!cur, pNone: R0.pNone, outDays: R0.EoutDays, turn: R0.Eturn, capped: R0.Ecap, end: R0.Eend }; }
    o.cmp = [row('现在的设定', R, true)];
    acts.forEach(function (a) { var ch = {}; Object.keys(a.set).forEach(function (k) { ch[k] = a.set[k]; }); o.cmp.push(row(a.label, cf(ch))); });
    return o;
  }

  /* ── 格式 ── */
  function fmt(v, d) { var s = (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); if (d) s = s.replace(/\.?0+$/, ''); var p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); return p.join('.'); }
  function fmt1(v) { return fmt(v, 1); }
  function hh(v) { return fmt(v, 0); }
  function hh1(v) { var r = Math.round(v * 10) / 10; if (r === 0 && v > 0) return '不到 0.1'; return fmt(v, v >= 100 ? 0 : 1); }
  function yuan(v) { return fmt(v, v >= 1000 ? 0 : 2); }
  /* 把握：贴近 0 / 100% 时加位数，但不写成 100% 或 0% 除非真是 */
  function pct(p) {
    /* 极小的非零概率写「不到 0.1%」，不说成不可能；算出来正好是 0 / 1 时，多半是 1e-17 以下的尾巴被丢掉了，写「≈0% / ≈100%」 */
    if (p >= 1) return '≈100%';
    if (p <= 0) return '≈0%';
    var x = p * 100;
    if (x > 99.9) { var d = 1; while (d < 4 && Math.round(x * Math.pow(10, d)) / Math.pow(10, d) >= 100) d++; return (Math.floor(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d).replace(/0+$/, '') + '%'; }
    if (x < 0.1) return '不到 0.1%';
    return fmt(x, 1) + '%';
  }

  /* 「30 天里一天都不断碗」；只算 1 天时说「这一天不断碗」 */
  function spanText(d) { return d === 1 ? '这一天不断碗' : d + ' 天里一天都不断碗'; }
  function headline(o) {
    var P = o.P;
    if (o.level === 'nobody') return '没有人来领，墙上的 ' + hh(P.s0) + ' 碗一碗也送不出去。';
    var pv = pct(o.pNone), s = spanText(P.days) + '的把握是' + (/^\d/.test(pv) ? ' ' : '') + pv;
    if (o.level === 'safe') return s + '，够了。';
    if (o.medFirst != null) return s + '：有一半的可能，到第 ' + o.medFirst + ' 天就已经断过一次。';
    return s + '，不到你要的 ' + fmt1(P.q) + '%。';
  }
  function explain(o) {
    var P = o.P, R = o.R;
    if (o.level === 'nobody') return '';
    var a = '每天平均挂进 ' + fmt1(P.give) + ' 碗、领走 ' + fmt1(P.take) + ' 碗';
    /* 设了每天上限且上限低于来领人数时，实际送出被上限压住，「净少几碗、撑几天」不成立，不说 */
    if (o.drift < -EPS && (P.cap === 0 || P.cap >= P.take)) a += '，平均每天净少 ' + fmt1(-o.drift) + ' 碗，开张的 ' + hh(P.s0) + ' 碗平均撑 ' + fmt1(P.s0 / -o.drift) + ' 天';
    else if (o.drift < -EPS) a += '，来领的比挂进的多，但每天最多送 ' + P.cap + ' 碗';
    else if (o.drift > EPS) a += '，平均每天还净多 ' + fmt1(o.drift) + ' 碗';
    else a += '，平均正好持平';
    a += '。' + (o.level === 'safe' ? (P.cap > 0 ? '每天的上限把碗留住了。' : '') : '可来的人数天天不一样，' + (o.drift >= -EPS ? '碰上来领的多、来挂的少的日子照样会断。' : '还会提前断。'));
    /* 「不到 0.1」前不留空格，读起来是「平均有不到 0.1 天」 */
    var sp = function (pre, v) { return pre + (/^\d/.test(v) ? ' ' : '') + v; };
    a += sp(P.days + ' 天里平均有', hh1(R.EoutDays)) + ' 天断碗、' + sp('一共', hh1(R.Eturn)) + ' 人次空手回去' + (P.cap > 0 ? '，' + sp('另有', hh1(R.Ecap)) + ' 人次被每天 ' + P.cap + ' 碗的上限挡回' : '') + '；' + sp('最后墙上平均还剩', hh1(R.Eend)) + ' 碗。';
    return a;
  }
  function verdict(o) {
    var P = o.P;
    if (o.level === 'nobody') return '';
    if (o.needS0 == null) return '照这个来领和挂的人数，开张挂到 ' + hh(SEARCH_S0) + ' 碗也到不了 ' + fmt1(P.q) + '% 的把握，得先让每天挂进来的多起来，或者少算几天。';
    if (o.needS0 <= P.s0) return '想要 ' + fmt1(P.q) + '% 的把握，开张挂 ' + hh(o.needS0) + ' 碗就够' + (P.price > 0 ? '（' + yuan(o.needS0 * P.price) + ' 元）' : '') + '，现在挂的 ' + hh(P.s0) + ' 碗已经达到。';
    return '想要 ' + fmt1(P.q) + '% 的把握，开张至少要挂 ' + hh(o.needS0) + ' 碗' + (P.price > 0 ? '，先垫 ' + yuan(o.needS0 * P.price) + ' 元' : '') + '，比现在多 ' + hh(o.needS0 - P.s0) + ' 碗。';
  }

  function csvCell(v) { var x = String(v); if (/^[=+\-@]/.test(x)) x = "'" + x; return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }
  function p6(v) { return (Math.round(v * 1e6) / 1e6).toFixed(6); }
  function toCSV(o, when) {
    var P = o.P, rows = [['第几天', '这天断碗的概率', '到这天还从没断过的概率', '这天头一次断碗的概率', '这天平均送出几碗', '这天平均空手回去几人次', '这天平均被上限挡回几人次', '这天结束墙上平均剩几碗']];
    o.day.forEach(function (d) { rows.push([d.t, p6(d.pOut), p6(d.pNone), p6(d.firstOut), d.served.toFixed(3), d.turn.toFixed(3), d.capped.toFixed(3), d.left.toFixed(3)]); });
    rows.push([], ['地点', P.place], ['开张挂了几碗', P.s0], ['每天平均来领', P.take], ['每天平均来挂', P.give], ['算几天', P.days], ['每天最多送（0=不限）', P.cap], ['一碗多少钱', P.price], ['导出时间', when || ''], ['说明', '泊松到达的概率模型，默认数字为虚构示例']);
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }
  function toMD(o, when) {
    var P = o.P, R = o.R, L = [];
    L.push('# 挂一碗面 · ' + (P.place || '这家店'), '', '_导出：' + (when || '') + '_', '');
    L.push('- 开张墙上挂了 ' + hh(P.s0) + ' 碗' + (P.price > 0 ? '（一碗 ' + yuan(P.price) + ' 元）' : ''), '- 每天平均 ' + fmt1(P.take) + ' 人来领、挂进 ' + fmt1(P.give) + ' 碗，算 ' + P.days + ' 天' + (P.cap > 0 ? '，每天最多送 ' + P.cap + ' 碗' : ''), '');
    L.push('**' + headline(o) + '**', '');
    if (explain(o)) L.push(explain(o), '');
    if (verdict(o)) L.push(verdict(o), '');
    o.actions.forEach(function (a) { L.push('- 改法：' + a.text); });
    L.push('', '| 第几天 | 这天断碗 | 到这天还没断过 | 墙上平均剩 |', '|---|---|---|---|');
    o.day.forEach(function (d) { L.push('| ' + d.t + ' | ' + pct(d.pOut) + ' | ' + pct(d.pNone) + ' | ' + hh1(d.left) + ' 碗 |'); });
    L.push('', '_来挂和来领的人数按泊松分布（每天互不影响、当天挂当天能领）精确推算，不是随机模拟；默认店铺和数字是虚构示例，不是对哪家真实店铺的预测。_');
    return L.join('\n') + '\n';
  }

  var api = { MAX_DAYS: MAX_DAYS, MAX_S0: MAX_S0, SEARCH_S0: SEARCH_S0, defaultState: defaultState, num: num, parse: parse, poisson: poisson, run: run, needS0: needS0, needGive: needGive, compute: compute,
    fmt: fmt, fmt1: fmt1, hh: hh, hh1: hh1, yuan: yuan, pct: pct, headline: headline, spanText: spanText, explain: explain, verdict: verdict, toCSV: toCSV, toMD: toMD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AppCore = api;
})(typeof window !== 'undefined' ? window : this);
