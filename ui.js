/* 挂一碗面 · 界面（ui.js）
 * 读 state → AppCore.compute → 把同一次输出画出来。页面自己不做估算。 */
(function () {
  'use strict';
  var A = window.AppCore;
  var KEY = 'hang-a-bowl:v1';
  var $ = function (id) { return document.getElementById(id); };
  var FIELDS = ['place', 'price', 's0', 'take', 'give', 'days', 'cap', 'q'];
  var LIM = { place: 30, price: 10, s0: 10, take: 8, give: 8, days: 6, cap: 6, q: 8 };
  var PRESETS = [
    { key: 'base', name: '巷口面馆（默认）', note: '虚构示例：一碗 15 元，开张墙上挂 60 碗，每天平均 20 人来领、挂进 18 碗，算 30 天，不设每天上限。' },
    { key: 'even', name: '挂的和领的一样多', note: '虚构示例：同一家店，每天平均挂进 20 碗、领走 20 碗，开张只挂 20 碗。', f: function (s) { s.give = '20'; s.s0 = '20'; } },
    { key: 'cap', name: '每天最多送 15 碗', note: '虚构示例：同一家店，店家规定每天最多送 15 碗，送完就挂「今日已送完」。', f: function (s) { s.cap = '15'; } },
    { key: 'nogive', name: '开张后没人再挂', note: '虚构示例：社区食堂一次性收到 40 份捐赠，之后没人再挂，每天平均 2 人来领，算 20 天。', f: function (s) { s.place = '社区食堂'; s.price = '12'; s.s0 = '40'; s.take = '2'; s.give = '0'; s.days = '20'; } },
    { key: 'rush', name: '刚上热搜的店', note: '虚构示例：一家店上了新闻，每天平均 45 人来领，挂进 30 碗，墙上先挂 200 碗，算 14 天。', f: function (s) { s.place = '上了新闻的面馆'; s.s0 = '200'; s.take = '45'; s.give = '30'; s.days = '14'; } }
  ];
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function presetState(k) { var s = A.defaultState(), p = PRESETS.filter(function (q) { return q.key === k; })[0]; if (p.f) p.f(s); return s; }
  function norm(s) { var d = {}; FIELDS.forEach(function (k) { d[k] = String(s[k]); }); return JSON.stringify(d); }
  function presetKey(s) { var j = norm(s); for (var i = 0; i < PRESETS.length; i++) if (norm(presetState(PRESETS[i].key)) === j) return PRESETS[i].key; return null; }

  function str(v, n) { return v == null || typeof v === 'object' ? '' : String(v).slice(0, n); }
  function sanitize(s) {
    if (!s || typeof s !== 'object') return null;
    var d = A.defaultState(), any = false;
    FIELDS.forEach(function (k) { if (k in s) { d[k] = str(s[k], LIM[k]); any = true; } });
    return any ? d : null;
  }
  function load() { try { var t = localStorage.getItem(KEY); if (!t) return null; var j = JSON.parse(t); return sanitize(j && j.state); } catch (e) { return null; } }
  var state = load() || A.defaultState(), out = null, sel = null, tmr = null;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, state: state, sel: sel })); $('saveTag').textContent = '· 已自动存在本机'; } catch (e) { $('saveTag').textContent = '· 这台设备存不了，刷新会丢'; }
  }
  try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv && typeof sv.sel === 'number') sel = sv.sel; } catch (e) {}
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fillAll() { FIELDS.forEach(function (k) { $(k).value = state[k]; }); }

  /* 输入：每次按键立即重算（推 60 天最坏约 0.4 秒，所以排到下一帧，连按时只算最后一次） */
  FIELDS.forEach(function (k) { $(k).addEventListener('input', function () { state[k] = this.value; schedule(); }); });
  function schedule() { clearTimeout(tmr); tmr = setTimeout(update, 60); }
  $('presets').addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (!b) return; state = presetState(b.getAttribute('data-p')); sel = null; fillAll(); update(); });
  $('acts').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b || !out || !out.ok) return;
    var a = out.actions.filter(function (x) { return x.id === b.getAttribute('data-act'); })[0]; if (!a) return;
    Object.keys(a.set).forEach(function (k) { state[k] = a.set[k]; }); fillAll(); update();
  });
  $('cal').addEventListener('click', function (e) { var b = e.target.closest('[data-day]'); if (!b || !out || !out.ok) return; sel = +b.getAttribute('data-day'); renderCal(out); save(); });

  function markErrors() {
    document.querySelectorAll('.bad').forEach(function (e) { e.classList.remove('bad'); });
    if (!out.ok) out.errors.forEach(function (er) { var el = $(er.field); if (el) el.classList.add('bad'); });
  }
  function renderPresets() {
    var key = presetKey(state);
    $('presets').innerHTML = PRESETS.map(function (p) { return '<button type="button" class="chip" id="preset_' + p.key + '" data-p="' + p.key + '" aria-pressed="' + (key === p.key) + '">' + esc(p.name) + '</button>'; }).join('');
    var cur = PRESETS.filter(function (p) { return p.key === key; })[0];
    $('presetNote').textContent = cur ? cur.note : '你改过的设定（数字仍然只是你填的假设）。';
  }

  function heat(p) { return p < 0.01 ? '#ffffff' : p < 0.1 ? '#f8dcc2' : p < 0.3 ? '#ecaa86' : '#cf6a4c'; }
  function renderWall(o) {
    var P = o.P, show = Math.min(P.s0, 120), h = '';
    for (var j = 0; j < show; j++) h += '<i></i>';
    if (!P.s0) h += '<i class="x"></i>';
    h += '<em>' + (P.s0 > show ? '… 共 ' : '共 ') + A.hh(P.s0) + ' 碗' + (P.price > 0 ? '，' + A.yuan(P.s0 * P.price) + ' 元' : '') + '</em>';
    $('wall').innerHTML = h;
    $('wallNote').textContent = '每天平均挂进 ' + A.fmt1(P.give) + '、领走 ' + A.fmt1(P.take) + (P.cap > 0 ? '，每天最多送 ' + P.cap : '');
  }
  function renderCal(o) {
    var d = o.day, P = o.P;
    if (sel == null || sel < 1 || sel > d.length) sel = defaultSel(o);
    $('cal').innerHTML = d.map(function (r) {
      var dark = r.pOut >= 0.3;
      return '<button type="button" id="day' + r.t + '" data-day="' + r.t + '" class="' + (r.t === sel ? 'sel' : '') + '" style="background:' + heat(r.pOut) + (dark ? ';color:#fff' : '') + '" aria-label="第 ' + r.t + ' 天断碗的把握 ' + A.pct(r.pOut) + '"><b' + (dark ? ' style="color:#fff"' : '') + '>' + r.t + '</b><span>' + A.pct(r.pOut) + '</span></button>';
    }).join('');
    var r = d[sel - 1];
    $('dayText').textContent = '第 ' + r.t + ' 天：这天断碗（有人空手回去）的把握 ' + A.pct(r.pOut) + '；到这天为止一次都没断过的把握 ' + A.pct(r.pNone) + '。这天平均送出 ' + A.hh1(r.served) + ' 碗、空手回去 ' + A.hh1(r.turn) + ' 人次' + (P.cap > 0 ? '、被上限挡回 ' + A.hh1(r.capped) + ' 人次' : '') + '，收工时墙上平均剩 ' + A.hh1(r.left) + ' 碗。';
  }
  function defaultSel(o) { return o.firstDayRisky || o.day.length; }

  function nice(lo, hi, n) {
    var span = hi - lo, step = Math.pow(10, Math.floor(Math.log(span / n) / Math.LN10)), m = span / n / step;
    step *= m > 5 ? 10 : m > 2 ? 5 : m > 1 ? 2 : 1;
    var r = []; for (var v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) r.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    return r;
  }
  function boxW(id, def) { var r = $(id).getBoundingClientRect().width; return r > 0 ? Math.max(280, Math.min(def, Math.round(r))) : def; }
  function chart(id, ys, opt) {
    var W = boxW(id, 460), H = 220, L = 46, R = 14, T = 26, B = 34, n = ys.length;
    var lo = opt.lo, hi = opt.hi; if (hi - lo < 1e-9) hi = lo + 1;
    var X = function (t) { return L + (W - L - R) * (n === 1 ? 0.5 : (t - 1) / (n - 1)); }, Y = function (v) { return T + (H - T - B) * (hi - v) / (hi - lo); };
    var g = '';
    nice(lo, hi, 4).forEach(function (v) { g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" stroke="#eee6d8"/><text x="' + (L - 6) + '" y="' + (Y(v) + 4).toFixed(1) + '" fill="#8a7e72" font-size="11" text-anchor="end">' + esc(opt.yf(v)) + '</text>'; });
    if (opt.ref != null) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(opt.ref).toFixed(1) + '" y2="' + Y(opt.ref).toFixed(1) + '" stroke="#8a7e72" stroke-dasharray="4 3"/><text x="' + (L + 4) + '" y="' + (Y(opt.ref) + 14).toFixed(1) + '" fill="#6f645a" font-size="11">' + esc(opt.refT) + '</text>';
    if (n === 1) g += '<circle cx="' + X(1).toFixed(1) + '" cy="' + Y(ys[0]).toFixed(1) + '" r="4" fill="' + opt.col + '"/>';
    else g += '<polyline fill="none" stroke="' + opt.col + '" stroke-width="2.4" points="' + ys.map(function (v, i) { return X(i + 1).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ') + '"/>';
    var step = Math.max(1, Math.ceil((n - 1) / (W < 400 ? 4 : 6)));
    for (var t = 1; t <= n - step / 2; t += step) g += '<text x="' + X(t).toFixed(1) + '" y="' + (H - B + 16) + '" fill="#8a7e72" font-size="11" text-anchor="' + (t === 1 ? 'start' : 'middle') + '">' + t + '</text>';
    g += '<text x="' + X(n).toFixed(1) + '" y="' + (H - B + 16) + '" fill="#8a7e72" font-size="11" text-anchor="end">' + n + '</text>';
    g += '<text x="' + ((L + W - R) / 2) + '" y="' + (H - 3) + '" fill="#8a7e72" font-size="11" text-anchor="middle">第几天</text>';
    var lx = X(n), ly = Y(ys[n - 1]);
    g += '<circle cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="4.5" fill="#8a4b12"/><text x="' + (W - R) + '" y="' + (T - 9) + '" fill="#8a4b12" font-size="12.5" font-weight="700" text-anchor="end">● 第 ' + n + ' 天：' + esc(opt.last) + '</text>';
    $(id).setAttribute('viewBox', '0 0 ' + W + ' ' + H); $(id).innerHTML = g;
  }
  function renderCharts(o) {
    var d = o.day, P = o.P;
    chart('chNone', d.map(function (r) { return r.pNone * 100; }), { lo: 0, hi: 100, col: '#2f7a55', yf: function (v) { return v + '%'; }, ref: P.q, refT: '你要的 ' + A.fmt1(P.q) + '%', last: A.pct(o.pNone) });
    var lefts = d.map(function (r) { return r.left; }), mx = Math.max.apply(null, lefts.concat([P.s0, 1]));
    chart('chLeft', lefts, { lo: 0, hi: mx * 1.08, col: '#8a4b12', yf: function (v) { return A.hh(v); }, last: A.hh1(lefts[lefts.length - 1]) + ' 碗' });
    $('cmp').innerHTML = '<tr><th>做法</th><th>一天不断</th><th>断碗天数</th><th>空手回去</th>' + (o.cmp.some(function (r) { return r.capped > 0.05; }) ? '<th>被上限挡回</th>' : '') + '<th>最后剩</th></tr>' + o.cmp.map(function (r) {
      var c = o.cmp.some(function (x) { return x.capped > 0.05; });
      return '<tr' + (r.cur ? ' class="cur"' : '') + '><td>' + esc(r.name) + '</td><td>' + A.pct(r.pNone) + '</td><td>' + A.hh1(r.outDays) + ' 天</td><td>' + A.hh1(r.turn) + ' 人次</td>' + (c ? '<td>' + A.hh1(r.capped) + ' 人次</td>' : '') + '<td>' + A.hh1(r.end) + ' 碗</td></tr>';
    }).join('');
  }

  function render() {
    var o = out;
    $('errBox').classList.toggle('hide', o.ok);
    ['okBox', 'wallPanel', 'chartPanel'].forEach(function (id) { $(id).classList.toggle('hide', !o.ok); });
    if (!o.ok) { $('errBox').innerHTML = '先改好标红的地方：<ul>' + o.errors.map(function (e) { return '<li>' + esc(e.message) + '</li>'; }).join('') + '</ul>'; return; }
    var P = o.P, none = o.level === 'nobody';
    var ns = o.needS0 == null ? '挂满 ' + A.hh(A.SEARCH_S0) + ' 也不够' : A.hh(o.needS0) + ' 碗';
    $('tot').innerHTML =
      '<div class="key"><span>' + A.spanText(P.days) + '的把握</span><b class="' + (o.pNone >= o.q - 1e-12 ? 'pos' : 'neg') + '">' + A.pct(o.pNone) + '</b><small>你要的是 ' + A.fmt1(P.q) + '%</small></div>' +
      '<div><span>平均有几人次空手回去</span><b>' + (none ? '0' : A.hh1(o.R.Eturn)) + '</b><small>' + (none ? '没人来领' : '平均 ' + A.hh1(o.R.EoutDays) + ' 天断过碗') + '</small></div>' +
      '<div><span>要 ' + A.fmt1(P.q) + '% 把握，开张至少挂</span><b class="' + (ns.length > 9 ? 'lg' : '') + '">' + (none ? '0 碗' : ns) + '</b><small>' + (none || o.needS0 == null || !(P.price > 0) ? '现在挂了 ' + A.hh(P.s0) + ' 碗' : '= ' + A.yuan(o.needS0 * P.price) + ' 元；现在 ' + A.hh(P.s0) + ' 碗') + '</small></div>';
    $('headline').textContent = A.headline(o);
    $('why').textContent = A.explain(o);
    var v = A.verdict(o); $('verdict').classList.toggle('hide', !v); $('verdict').textContent = v;
    $('acts').innerHTML = o.actions.map(function (a) { return '<button type="button" class="act" id="' + a.id + '" data-act="' + a.id + '">→ ' + esc(a.text) + '</button>'; }).join('');
    renderWall(o); renderCal(o); renderCharts(o);
  }
  var rsz = null; window.addEventListener('resize', function () { clearTimeout(rsz); rsz = setTimeout(function () { if (out && out.ok) renderCharts(out); }, 120); });
  function update() { clearTimeout(tmr); out = A.compute(state); if (out.ok && sel != null && sel > out.day.length) sel = null; markErrors(); renderPresets(); render(); save(); }

  function stamp() { var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function download(name, blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  function tag() { return out.ok ? '把握' + A.pct(out.pNone).replace(/[^0-9.%]/g, '') : '待改'; }
  $('dlCsv').addEventListener('click', function () { if (out.ok) download('挂一碗面-逐天明细.csv', new Blob(['\ufeff' + A.toCSV(out, stamp())], { type: 'text/csv;charset=utf-8' })); });
  $('dlMd').addEventListener('click', function () { if (out.ok) download('挂一碗面-' + tag() + '.md', new Blob([A.toMD(out, stamp())], { type: 'text/markdown;charset=utf-8' })); });
  $('dlJson').addEventListener('click', function () { download('挂一碗面-备份.json', new Blob([JSON.stringify({ app: '挂一碗面', slug: 'hang-a-bowl', version: 1, exported_at: stamp(), state: state }, null, 2)], { type: 'application/json' })); });
  $('impJson').addEventListener('click', function () { $('impFile').click(); });
  $('impFile').addEventListener('change', function () { var f = this.files && this.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { importText(String(rd.result)); }; rd.readAsText(f); this.value = ''; });
  function importText(t) {
    var s = null;
    try { var j = JSON.parse(t); s = sanitize(j && j.state ? j.state : j); } catch (e) { s = null; }
    if (!s) { $('saveTag').textContent = '· 这个文件读不出来，没改动'; return false; }
    state = s; sel = null; fillAll(); update(); return true;
  }
  $('reset').addEventListener('click', function () { state = A.defaultState(); sel = null; fillAll(); update(); });

  /* 结果卡 PNG 1080×1350：文字取自同一次 out */
  function drawCard() {
    var W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d'), FF = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    g.fillStyle = '#f4efe6'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fffdf8'; g.fillRect(50, 50, W - 100, H - 100);
    var L = 110, Rr = W - 110, maxW = Rr - L, y = 150;
    function font(size, bold) { g.font = (bold ? '700 ' : '') + size + 'px ' + FF; }
    function clip(t, w) { t = String(t); if (g.measureText(t).width <= w) return t; while (t.length > 1 && g.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; }
    function wrap(t, size, color, bold, lim) {
      font(size, bold); g.fillStyle = color; var cur = '', n = 0;
      var toks = String(t).match(/[−+]?[0-9.,%]+ ?(?:碗|元|天|人次|%)?[）)。，、；：]?|[（(「]?[A-Za-z]+[）)」。，、；：]?|[（(「]?[^\s（(「][）)」。，、；：]?|\s/g) || [];
      for (var i = 0; i < toks.length; i++) { var ch = toks[i]; if (g.measureText(cur + ch).width > maxW && cur) { if (lim && ++n >= lim) { g.fillText(clip(cur + '…', maxW), L, y); y += size * 1.5; return; } g.fillText(cur, L, y); y += size * 1.5; cur = ch.trim() ? ch : ''; } else cur += ch; }
      if (cur) { g.fillText(cur, L, y); y += size * 1.5; }
    }
    font(56, true); g.fillStyle = '#2a2420'; g.fillText('挂一碗面', L, y); y += 56;
    if (!out.ok) { font(44, true); g.fillStyle = '#b5402f'; g.fillText('还算不了', L, y + 20); y += 90; out.errors.slice(0, 7).forEach(function (e) { wrap('· ' + e.message, 28, '#5a4f46', false, 3); y += 8; }); y += 30; wrap('改好标红的地方，结果会自动重算。', 26, '#8a7e72'); y += 40; wrap('这张卡算的是：墙上先挂了几碗、每天有人来挂有人来领，这段日子里会不会哪天被领空、开张要先挂多少碗才稳。', 26, '#8a7e72'); return cv; }
    var o = out, P = o.P;
    font(26); g.fillStyle = '#8a7e72'; g.fillText(clip((P.place || '这家店') + ' · 开张挂 ' + A.hh(P.s0) + ' 碗 · 每天来领 ' + A.fmt1(P.take) + ' / 挂进 ' + A.fmt1(P.give) + (P.cap > 0 ? ' · 每天最多送 ' + P.cap : ''), maxW), L, y); y += 56;
    wrap(A.headline(o), 38, '#8a4b12', true, 3); y += 14;
    var bw = (maxW - 40) / 3, none = o.level === 'nobody';
    var items = [[P.days === 1 ? '这一天不断' : P.days + ' 天一天不断', A.pct(o.pNone), o.pNone >= o.q - 1e-12 ? '#2f7a55' : '#b5402f'], ['空手回去', (none ? '0' : A.hh1(o.R.Eturn)) + ' 人次', '#2a2420'], ['要' + A.fmt1(P.q) + '%至少挂', none ? '0 碗' : o.needS0 == null ? '挂满也不够' : A.hh(o.needS0) + ' 碗', '#8a4b12']];
    items.forEach(function (it, i) { var x0 = L + i * (bw + 20); g.fillStyle = i === 0 ? '#fff1d6' : '#faf6ee'; g.fillRect(x0, y, bw, 120); font(22); g.fillStyle = '#8a7e72'; g.fillText(clip(it[0], bw - 30), x0 + 18, y + 40); var fs = 44; font(fs, true); while (fs > 20 && g.measureText(it[1]).width > bw - 30) { fs -= 2; font(fs, true); } g.fillStyle = it[2]; g.fillText(it[1], x0 + 18, y + 98); });
    y += 170;
    /* 日历条（与页面同一份 o.day） */
    font(24, true); g.fillStyle = '#5a4f46'; g.fillText('一天一格：这天断碗的把握', L, y); y += 22;
    var n = o.day.length, cols = n <= 10 ? n : n <= 30 ? 10 : 15, rowsN = Math.ceil(n / cols), cw = (maxW - (cols - 1) * 8) / cols, chh = Math.min(64, (300 - (rowsN - 1) * 8) / rowsN);
    o.day.forEach(function (r, i) {
      var cx = L + (i % cols) * (cw + 8), cy = y + Math.floor(i / cols) * (chh + 8);
      g.fillStyle = heat(r.pOut); g.fillRect(cx, cy, cw, chh); g.strokeStyle = '#e2d8c8'; g.lineWidth = 1; g.strokeRect(cx + 0.5, cy + 0.5, cw - 1, chh - 1);
      font(Math.min(22, chh * 0.42), true); g.fillStyle = r.pOut >= 0.3 ? '#fff' : '#5a4f46'; g.textAlign = 'center'; g.fillText(String(r.t), cx + cw / 2, cy + chh * 0.62); g.textAlign = 'left';
    });
    y += rowsN * (chh + 8) + 20;
    font(20); var lx = L;[['不到 1%', '#ffffff'], ['1%–10%', '#f8dcc2'], ['10%–30%', '#ecaa86'], ['30% 以上', '#cf6a4c']].forEach(function (k) { g.fillStyle = k[1]; g.fillRect(lx, y - 16, 20, 20); g.strokeStyle = '#d0c4b0'; g.strokeRect(lx + 0.5, y - 15.5, 19, 19); g.fillStyle = '#8a7e72'; g.fillText(k[0], lx + 28, y); lx += 40 + g.measureText(k[0]).width; });
    y += 56;
    var v = A.verdict(o); if (v) { wrap(v, 28, '#245c40', true, 3); y += 10; }
    o.actions.slice(0, 3).forEach(function (ac) { if (y < H - 260) { wrap('改法：' + ac.text + '。', 26, '#5a4f46', false, 2); y += 6; } });
    y = H - 150;
    wrap('来挂和来领的人数按泊松分布精确推算（每天互不影响），真实店里人数通常更忽高忽低，把握偏乐观。默认店铺和数字为虚构示例。', 20, '#8a7e72', false, 2);
    return cv;
  }
  $('dlPng').addEventListener('click', function () { drawCard().toBlob(function (b) { if (b) download('挂一碗面-' + tag() + '-1080x1350.png', b); }, 'image/png'); });

  window.__hbUi = { state: function () { return clone(state); }, out: function () { return out; }, importText: importText, drawCard: drawCard, storageKey: KEY };
  fillAll(); update();
})();
