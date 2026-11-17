'use strict';
/* 注入测试：对 core.js 做一处小改动，看核心测试能不能抓到。跑完自动还原。 */
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const F=path.join(__dirname,'../core.js'),src=fs.readFileSync(F,'utf8');
/* 记录的近似等价变异：needS0 里 pNone >= q − EPS 改成 > q——只有把握恰好等于目标时有区别；泊松概率含 e^−λ，不会恰好等于一位小数的百分数，测不出，保留原写法。 */
const M=[
["if (o.drift < -EPS && (P.cap === 0 || P.cap >= P.take))","if (o.drift < -EPS)"],
["for (var a = 0; a < A.length; a++) y[x + a] += px * A[a];","for (var a = 1; a < A.length; a++) y[x + a] += px * A[a];"],
["var want = Math.min(b, mCap);","var want = b;"],
["if (want > sv) { dayOut += pr;","if (want >= sv) { dayOut += pr;"],
["var sv = Math.min(lim, b), nx = y - sv;","var sv = Math.min(y, b), nx = y - sv;"],
["if (b2 > lim2 && y2 < mCap) { firstOut += q; continue; }","if (b2 > lim2) { firstOut += q; continue; }"],
["if (b2 > lim2 && y2 < mCap) { firstOut += q; continue; }","if (b2 > y2) { firstOut += q; continue; }"],
["ng[y2 - Math.min(lim2, b2)] += q;","ng[y2 - b2 < 0 ? 0 : y2 - b2] += q;"],
["while (lo < hi && a[lo] < CUT)","while (lo < hi && a[lo] < 1e-6)"],
["pNone -= firstOut;","pNone -= firstOut * 0.999;"],
["if (ok(0)) return 0;\n    if (!ok(SEARCH_S0)) return null;","if (!ok(SEARCH_S0)) return null;"],
["while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (ok(mid)) hi = mid; else lo = mid; }\n    return hi;","while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (ok(mid)) hi = mid; else lo = mid; }\n    return lo;"],
["return hi / 10;","return Math.ceil(hi / 10);"],
["return run(s, P.give, P.take, P.days, P.cap, false).pNone >= q - EPS;","return run(s, P.give, P.take, P.days, P.cap, false).pNone > q;"],
["SEARCH_S0 = 2000","SEARCH_S0 = 5000"],
["o.level = P.take === 0 ? 'nobody' : o.pNone >= q - EPS ? 'safe' : o.pNone >= 0.5 - EPS ? 'shaky' : 'short';","o.level = P.take === 0 ? 'nobody' : o.pNone >= q - EPS ? 'safe' : 'shaky';"],
["if (o.medFirst == null && cum >= 0.5 - EPS) o.medFirst = d.t;","if (o.medFirst == null && cum > 0.6) o.medFirst = d.t;"],
["if (o.needS0 != null && o.needS0 !== P.s0) {","if (o.needS0 != null && o.needS0 > P.s0) {"],
["if (P.cap === 0 && o.level !== 'safe' && P.give < P.take - EPS && P.give >= 1) {","if (P.give < P.take - EPS && P.give >= 1) {"],
["if (P.cap === 0 && o.level !== 'safe' && P.give < P.take - EPS && P.give >= 1) {","if (P.cap === 0 && P.give < P.take - EPS && P.give >= 1) {"],
["return d === 1 ? '这一天不断碗' :","return"],
["if (P.cap > 0) {\n        var r4","if (P.cap >= 0) {\n        var r4"],
["if (o.level !== 'nobody') {\n      if (o.needS0","if (true) {\n      if (o.needS0"],
["P.s0 = need('s0', 0, MAX_S0, true,","P.s0 = need('s0', 0, MAX_S0, false,"],
["P.days = need('days', 1, MAX_DAYS, true,","P.days = need('days', 0, MAX_DAYS, true,"],
["P.cap = need('cap', 0, MAX_CAP, true,","P.cap = need('cap', 0, 1000, true,"],
["P.q = need('q', 50, 99.9, false,","P.q = need('q', 0, 99.9, false,"],
["if (!errs.length && P.take > 0 && P.take * 10 % 1 > EPS)","if (false)"],
["if (!errs.length && P.give * 10 % 1 > EPS)","if (false)"],
["if (p >= 1) return '≈100%';","if (p >= 0.9999) return '≈100%';"],
["if (p <= 0) return '≈0%';","if (p <= 1e-15) return '≈0%';"],
["if (x < 0.1) return '不到 0.1%';","if (x < 0.01) return '不到 0.1%';"],
["if (r === 0 && v > 0) return '不到 0.1';","if (false) return '不到 0.1';"],
["function yuan(v) { return fmt(v, v >= 1000 ? 0 : 2); }","function yuan(v) { return fmt(v, 2); }"],
["if (/^[=+\\-@]/.test(x)) x = \"'\" + x;",""],
["replace(/[,，\\s]/g, '')","replace(/[，\\s]/g, '')"],
["if (o.level === 'safe') return s + '，够了。';","if (o.level === 'safe') return s + '。';"],
];
let caught=0;const rows=[];
for(const [a,b] of M){
  if(src.indexOf(a)<0){rows.push('✗ 找不到原文：'+a.slice(0,80));continue;}
  fs.writeFileSync(F,src.replace(a,b));
  let ok=true;try{execFileSync('node',['--test',path.join(__dirname,'core.test.cjs')],{stdio:'pipe'});}catch(e){ok=false;}
  rows.push((ok?'✗ 没抓到':'✓ 抓到')+'：'+a.slice(0,70).replace(/\n/g,'⏎')+' → '+b.slice(0,70).replace(/\n/g,'⏎'));if(!ok)caught++;
}
fs.writeFileSync(F,src);
console.log(rows.join('\n'));console.log('合计 '+caught+'/'+M.length);
