#!/usr/bin/env python3
"""挂一碗面 · 独立参考实现（不读 core.js）。
写法与 core.js 不同：
  - 状态用 (墙上剩几碗, 是否已经断过) 的字典联合推，而不是两条链分开推；
  - 每天枚举 (来挂 a, 来领 b) 对，泊松概率用 math.lgamma 直接算，而不是递推；
  - 「要挂多少碗」用从 0 起逐个往上试（线性扫描），而不是二分。
另给两个闭式锚点：没人来挂且不设上限时，一天不断 ⇔ 总共来领 ≤ 起始碗数 → 泊松 CDF；
以及守恒：送出 + 最后剩下 = 起始 + 挂进；送出 + 空手 + 被上限挡回 = 来领总数。
输出 tests/ref.json。"""
import json, math, random, os

def pmf(lam, cut=1e-16):
    if lam == 0:
        return [(0, 1.0)]
    out, k = [], 0
    while True:
        p = math.exp(-lam + k * math.log(lam) - math.lgamma(k + 1))
        if p >= cut:
            out.append((k, p))
        elif k > lam:
            break
        k += 1
    return out

def sim(s0, give, take, days, cap):
    A, B = pmf(give), pmf(take)
    mcap = cap if cap > 0 else 10 ** 9
    st = {(s0, False): 1.0}
    turn = capd = served = 0.0
    out_days = 0.0
    for _ in range(days):
        nx = {}
        for (x, bad), p in st.items():
            for a, pa in A:
                y = x + a
                lim = min(y, mcap)
                for b, pb in B:
                    pr = p * pa * pb
                    want = min(b, mcap)
                    sv = min(lim, b)
                    capd += pr * (b - want)
                    turned = want - sv
                    turn += pr * turned
                    served += pr * sv
                    if turned > 0:
                        out_days += pr
                    key = (y - sv, bad or turned > 0)
                    nx[key] = nx.get(key, 0.0) + pr
        st = {k: v for k, v in nx.items() if v >= 1e-18}
    none = sum(v for (x, bad), v in st.items() if not bad)
    tot = sum(st.values())
    end = sum(v * x for (x, bad), v in st.items())
    return dict(pNone=none / tot, Eturn=turn, Ecap=capd, Eserved=served, Eend=end / tot, EoutDays=out_days)

def p_none(s0, give, take, days, cap):
    return sim(s0, give, take, days, cap)['pNone']

def need_s0(give, take, days, cap, q, hi=400):
    for s in range(0, hi + 1):
        if p_none(s, give, take, days, cap) >= q - 1e-12:
            return s
    return None

def main():
    rnd = random.Random(20261117)
    cases = []
    while len(cases) < 300:
        take = rnd.choice([0, 0.5, 1, 1.5, 2, 3, 4, 5, 6.5, 8])
        give = rnd.choice([0, 0.5, 1, 2, 3, 4, 5, 7.5])
        days = rnd.randint(1, 14)
        # 把起始碗数放在「刚好够 / 刚好不够」附近，让把握多落在 2%–98% 之间（只看极端值测不出东西）
        mu = max(0.0, (take - give) * days)
        s0 = max(0, min(60, int(round(mu + rnd.gauss(0, math.sqrt((take + give) * days + 1))))))
        cap = rnd.choice([0, 0, 0, 1, 2, 3, 5, 8])
        r = sim(s0, give, take, days, cap)
        r.update(s0=s0, give=give, take=take, days=days, cap=cap)
        cases.append(r)
    # 「要挂多少碗」：抽 40 组小参数逐个往上试
    needs = []
    for _ in range(40):
        take = rnd.choice([1, 2, 3, 4])
        give = rnd.choice([0, 0.5, 1, 2, 3])
        days = rnd.randint(1, 10)
        cap = rnd.choice([0, 0, 2, 3])
        q = rnd.choice([0.5, 0.8, 0.9, 0.95])
        needs.append(dict(give=give, take=take, days=days, cap=cap, q=q, need=need_s0(give, take, days, cap, q)))
    # 闭式锚点：没人来挂、不设上限
    closed = []
    for s0, take, days in [(60, 2, 30), (10, 1, 7), (40, 2, 20), (0, 0.5, 3), (25, 3, 8)]:
        lam = take * days
        cdf = sum(math.exp(-lam + k * math.log(lam) - math.lgamma(k + 1)) for k in range(0, s0 + 1))
        closed.append(dict(s0=s0, take=take, days=days, cdf=cdf, dp=p_none(s0, 0, take, days, 0)))
    here = os.path.dirname(os.path.abspath(__file__))
    json.dump(dict(cases=cases, needs=needs, closed=closed), open(os.path.join(here, 'ref.json'), 'w'), indent=0)
    worst = max(abs(c['cdf'] - c['dp']) for c in closed)
    flips = sum(1 for c in cases if 0.02 < c['pNone'] < 0.98)
    print('cases', len(cases), '中间把握(2%–98%)', flips, '| needs', len(needs), 'None', sum(1 for n in needs if n['need'] is None),
          '| 闭式 vs DP 最大差', worst)
    cons = max(max(abs(c['Eserved'] + c['Eend'] - c['s0'] - c['give'] * c['days']), abs(c['Eserved'] + c['Eturn'] + c['Ecap'] - c['take'] * c['days'])) for c in cases)
    print('守恒最大误差', cons)

if __name__ == '__main__':
    main()
