"""
Five-year operating and financial model — SME business-intelligence data plane, Thailand.

This file is the SINGLE SOURCE OF TRUTH for every number in cost-model.html and in the
published artifact. If a figure in the document disagrees with this script, the script wins
and the document is stale. Regenerate with:

    python3 docs/marketplane/finance/model.py

Currency: Thai baht throughout. Vendor prices are entered in USD (that is how they are
invoiced) and converted at FX. All revenue is net of the 7% output VAT the company collects
and remits; all foreign vendor cost carries the 1.006 tax-and-FX uplift derived in §05 of the
document (0% withholding under TRD private ruling Gor Kor 0702/16261, 7% import VAT fully
creditable when VAT-registered, ~0.5% FX spread paid from a foreign-currency account).

WHAT IS MODELLED
  - Three SME tiers (Starter/Growth/Multi-unit) on a fixed 60/30/10 mix, split into monthly
    and annual cohorts with different churn (4.5% vs 2.0% a month).
  - Three enterprise bands (E1/E2/E3) from THB 30,000, with 1.0% churn and an internal
    expansion flow (2% of E1 -> E2 monthly, 1% of E2 -> E3).
  - A free tier: 4.3% free-to-paid conversion, 6% monthly dormancy, THB 1.65/head to serve.
  - Headcount driven by customer-count triggers, not dates. Payroll at 14 months of salary a
    year (12 + guaranteed 13th month + performance bonus) plus THB 750/head social security.
  - A conventional 200 sqm central-Bangkok lease with fit-out and deposit, expanding to
    420 sqm at month 42.
  - Full opex: tools per person, onboarding kit, recruitment, health cover, training, events,
    trade shows, travel, SOC 2, penetration testing, cyber cover, statutory audit, legal, DPO.
  - Revenue is recognised monthly; cash is collected up front on annual and enterprise plans.
    The gap between the two is the whole argument for selling annually.

WHAT IS NOT MODELLED (deliberate — see §10 of the document)
  Thai severance accrual, equipment refresh in year four, ESOP dilution, D&O cover,
  FX hedging, deferred-revenue accounting, a second office beyond the month-42 expansion.

KEY SWITCHES on run():
  route_from=15   ship the §03 routing engine in month 15 (question cost 9.87 -> 3.36 baht)
  ann=0.30        share of new customers taking an annual plan
  chm/cha         monthly-plan and annual-plan churn
  cac             paid-channel CAC in baht (blended with 40% organic at 1,974)
  mul             multiplier on the planned SME acquisition schedule
  emul            multiplier on the enterprise ramp
  ent=False       switch the enterprise tier off entirely

Verified inputs and their sources are listed in the footer of cost-model.html.
"""
FX=32.9; U=lambda d: d*FX          # USD -> THB
A_now={'sheet':0.335,'brief':0.024,'q':0.300,'rep':0.350}
A_new={'sheet':0.177,'brief':0.0044,'q':0.102,'rep':0.263}
SPEC={'S':(4.33,30,1,0.36,0.00,0.05,100),'G':(4.33,30,2,0.90,2.60,0.15,300),'M':(43.3,300,10,3.60,8.00,0.50,1000)}
STICK={'S':1590,'G':4190,'M':13800}; MIX={'S':.60,'G':.30,'M':.10}
def cg1(t,A,use=.15):
    sh,br,rp,serp,ai,inf,alw=SPEC[t]
    return (sh*A['sheet']*.5+br*A['brief']+rp*A['rep']*.5+serp+ai+inf+alw*use*A['q'])*1.006*FX
BLEND=lambda A: sum(cg1(t,A)*MIX[t] for t in MIX)
AM=10
NETM={k:v/1.07 for k,v in STICK.items()}; NETA={k:v*AM/12/1.07 for k,v in STICK.items()}
REVM=sum(NETM[t]*MIX[t] for t in MIX); REVA=sum(NETA[t]*MIX[t] for t in MIX)
PM=sum(STICK[t]*.037*MIX[t] for t in MIX); PA=sum(STICK[t]*AM/12*.037*MIX[t] for t in MIX)
SSO=U(125)*1.006
EB={'E1':dict(ws=3,q=2000,sso=1,price=37500.,cac=60000.),
    'E2':dict(ws=6,q=4000,sso=2,price=75000.,cac=140000.),
    'E3':dict(ws=12,q=8000,sso=3,price=160000.,cac=280000.)}
def ecogs(b,A):
    d=EB[b]; sh,br,rp,serp,ai,inf,_=SPEC['M']
    per=(sh*A['sheet']*.5+br*A['brief']+rp*A['rep']*.5+serp+ai+inf)/10
    return (per*d['ws']+d['q']*.15*A['q'])*1.006*FX
# ================= PEOPLE =================
BON=14/12
SAL={'sr_eng':120000,'eng':70000,'sec':90000,'cs':35000,'sdr':50000,'am':70000,'mkt':60000,'hr':55000,'fin':70000}
TECH={'sr_eng','eng','sec'}
def founder(m): return 120000 if m<13 else 150000
def hc(m,c):
    h={}
    if m>=7:h['eng']=1
    if m>=10:h['sec']=1
    if c>=150:h['cs']=1
    if c>=250:h['sdr']=1
    if c>=400 or m>=20:h['sr_eng']=1
    if c>=450:h['mkt']=1
    if c>=550:h['cs']=2
    if c>=600:h['am']=1
    if c>=700:h['sdr']=2
    if c>=800:h['eng']=2
    if c>=1000:h['sr_eng']=2
    if c>=1050:h['cs']=3
    if c>=1200:h['sdr']=3; h['sec']=2
    if c>=1300:h['am']=2
    if c>=1500:h['cs']=4
    if c>=1700:h['sdr']=4; h['eng']=3
    if c>=2000:h['sr_eng']=3; h['am']=3
    if c>=2300:h['cs']=5
    if c>=2600:h['sdr']=5; h['sec']=3
    if c>=2900:h['eng']=4; h['mkt']=2
    if c>=3200:h['cs']=6; h['am']=4
    if c>=3500:h['sr_eng']=4; h['sdr']=6
    if c>=4000:h['cs']=7; h['eng']=5
    if sum(h.values())+3>=12: h['hr']=1          # HR / People & Ops at 12 FTE
    if sum(h.values())+3>=20: h['fin']=1         # finance / ops manager at 20 FTE
    if sum(h.values())+3>=32: h['hr']=2
    return h
FTE=lambda m,c: sum(hc(m,c).values())+3
def payroll(m,c):
    h=hc(m,c); n=FTE(m,c)
    return (sum(SAL[k]*v for k,v in h.items())+3*founder(m))*BON+750*n+15000
# ================= OPEX =================
HEALTH=2500.                                   # group health, per head per month
TRAIN=20000/12; EVENTS=17000/12                # per head per month
PANTRY=1200.                                   # pantry, coffee, supplies, per head per month
SQM=200.; SQM2=420.; EXPAND=42                 # expand to 420 sqm at month 42
RENT_SQM=550.; SERVICE_SQM=130.; UTIL_SQM=150.
sqm=lambda m: SQM if m<EXPAND else SQM2
RENT=SQM*(RENT_SQM+SERVICE_SQM)
OFFICE_FIXED=SQM*UTIL_SQM+7000+12000+3000
FITOUT=SQM*15000.; FITOUT2=(SQM2-SQM)*15000.
DEPOSIT=3*RENT; DEPOSIT2=3*(SQM2-SQM)*(RENT_SQM+SERVICE_SQM)
def office(m):
    q=sqm(m)
    fixed=q*UTIL_SQM+7000+12000+3000+(6000 if m>=EXPAND else 0)
    return fixed if m<=2 else q*(RENT_SQM+SERVICE_SQM)+fixed
ONBOARD_T=104000.; ONBOARD_C=74000.            # laptop+monitor+chair+peripherals; desks are in the fit-out
RECRUIT=80000.                                 # blended agency + job board per hire
def tools(m,c):
    h=hc(m,c); t=0.
    t+=3*U(200)                                                  # founders — Claude Max 20x
    t+=h.get('sec',0)*U(200)                                     # security — Claude Max 20x
    t+=(h.get('sr_eng',0)+h.get('eng',0))*U(100)                 # engineers — Claude Max 5x
    comm=h.get('cs',0)+h.get('sdr',0)+h.get('am',0)+h.get('mkt',0)+h.get('hr',0)
    t+=comm*U(20)                                                # everyone else — Claude Team
    n=FTE(m,c)
    t+=n*U(12.5+14+8+10)                                         # Slack B+, Workspace, 1Password, Linear
    t+=(h.get('sr_eng',0)+h.get('eng',0)+h.get('sec',0)+1)*U(4)  # GitHub Team (+CTO)
    t+=U(80)+U(20)+U(50)+U(32)+U(48)                             # Sentry, email, CI, Figma, Zoom
    t+=1000+(3000 if n>=10 else 0)                               # accounting sw, HR/payroll sw
    return t
FIXPLAT=lambda c:(137 if c<150 else 200 if c<400 else 350 if c<800 else 550 if c<1200 else 900)*1.006*FX
def compliance(m):
    x=20000.                                                     # legal retainer
    x+=60000/12                                                  # statutory annual audit
    if m>=13: x+=U(10000)/12 + 400000/12                         # Vanta-class tooling + SOC 2 readiness
    if m>=25: x+=200000/12 + 150000/12                           # annual pentest + cyber/PI insurance
    if m>=24: x+=25000                                           # external DPO retainer
    return x
def expos(m): return 0 if m<13 else 500000/12                    # 2 trade shows a year from Y2
def travel(m): return 0 if m<10 else 30000.
ONEOFF={1:400000.+FITOUT*0.5+DEPOSIT, 2:FITOUT*0.5, 41:FITOUT2*0.5+DEPOSIT2, 42:FITOUT2*0.5}
FREE=.05*FX; CONV=.043; FCH=.06
BASE_ADDS=([0,0,0,0,0,6,9,13,17,23,29,36,42,48,54,60,66,72,78,84,90,96,102,108,112,118,124,130,136,142,148,154,160,166,172,178]
 +[184,190,196,202,208,214,220,226,232,238,244,250]
 +[255,260,265,270,275,280,285,290,295,300,305,310])
E_ADD={'E1':{**{14:1,16:1,18:1,19:1,20:1,21:1,22:1,23:1,24:1,25:1,26:1,27:1,28:1,29:1,30:1,31:1,32:1,33:1,34:1,35:1,36:1}, **{m:2 for m in range(37,61)}},
       'E2':{**{22:1,26:1,30:1,34:1}, **{m:1 for m in range(38,61,2)}},
       'E3':{**{29:1,35:1}, **{m:1 for m in range(40,61,4)}}}
ECH=.010; UP12,UP23=.020,.010
BAD=0.015                                          # failed payments / bad debt, % of SME revenue
SLA=0.010                                          # SLA credit provision, % of enterprise revenue
def run(ann=.30,chm=.045,cha=.020,cac=8324.,mul=1.,A=A_now,emul=1.0,ent=True,route_from=None,label=''):
    org=1974.; mu=98700.
    CBn,CBr=BLEND(A_now),BLEND(A_new)
    ECGn={b:ecogs(b,A_now) for b in EB}; ECGr={b:ecogs(b,A_new) for b in EB}
    EN={'E1':0.,'E2':0.,'E3':0.}; mo=0.;coh=[];free=0.;cash=0.;be=None;rows=[];prev_h=None
    for i,a0 in enumerate(BASE_ADDS,1):
        a=a0*mul; na=a*ann; nm=a-na
        free=free*(1-FCH)+a*(1-MIX['M'])/CONV
        mo=mo*(1-chm)+nm
        coh=[(s,n*(1-cha)) for s,n in coh]
        cin=na*REVA*12+sum(n*REVA*12 for s,n in coh if i>s and (i-s)%12==0)
        coh.append((i,na)); ann_c=sum(n for _,n in coh); c=mo+ann_c
        if ent:
            u12,u23=EN['E1']*UP12,EN['E2']*UP23
            for b in EN: EN[b]*=(1-ECH)
            EN['E1']+=-u12+E_ADD['E1'].get(i,0)*emul
            EN['E2']+= u12-u23+E_ADD['E2'].get(i,0)*emul
            EN['E3']+= u23+E_ADD['E3'].get(i,0)*emul
        erev=sum(EN[b]*EB[b]['price']/1.07 for b in EN)
        srev=mo*REVM+ann_c*REVA
        rev=srev+erev; crev=mo*REVM+cin+erev
        routed = route_from is not None and i>=route_from
        CB = CBr if routed else CBn; ECG = ECGr if routed else ECGn
        cog=c*CB+free*FREE+sum(EN[b]*(ECG[b]+EB[b]['sso']*SSO) for b in EN)
        pc=mo*PM+ann_c*PA+sum(EN[b]*EB[b]['price']*.037 for b in EN)+srev*BAD+erev*SLA
        h=hc(i,c); n=FTE(i,c); pay=payroll(i,c)
        newT=0 if prev_h is None else sum(max(0,h.get(k,0)-prev_h.get(k,0)) for k in TECH)
        newC=0 if prev_h is None else sum(max(0,h.get(k,0)-prev_h.get(k,0)) for k in h if k not in TECH)
        if prev_h is None: newT,newC=0,0
        prev_h=dict(h)
        onb=newT*ONBOARD_T+newC*ONBOARD_C+(newT+newC)*RECRUIT
        ppl=n*(HEALTH+TRAIN+EVENTS+PANTRY)+office(i)
        ops=tools(i,c)+FIXPLAT(c)+compliance(i)+expos(i)+travel(i)+ONEOFF.get(i,0)+onb
        mkt=a*(1-MIX['M'])*(0.6*cac+0.4*org)+a*MIX['M']*mu*.25+(sum(E_ADD[b].get(i,0)*emul*EB[b]['cac'] for b in EB) if ent else 0)
        e=rev-cog-pc-pay-ppl-ops-mkt; cf=crev-cog-pc-pay-ppl-ops-mkt; cash+=cf
        if be is None and e>0: be=i
        rows.append(dict(m=i,c=c,ann=ann_c,ent=sum(EN.values()),e1=EN['E1'],e2=EN['E2'],e3=EN['E3'],erev=erev,
                         free=free,rev=rev,crev=crev,cogs=cog,proc=pc,pay=pay,ppl=ppl,ops=ops,mkt=mkt,
                         onb=onb,e=e,cf=cf,cash=cash,fte=n))
    cp=[r for r in rows if r['cash']>0]
    return rows,be,min(r['cash'] for r in rows),(cp[0]['m'] if cp else None)


# ---------------------------------------------------------------- reporting
def _years(rows, f):
    return [sum(f(q) for q in rows[y*12:(y+1)*12]) for y in range(len(rows)//12)]


def report(tag, rows):
    print(f"\n{'='*104}\n{tag}\n{'='*104}")
    lines = [
        ('Revenue recognised',        lambda q: q['rev']),
        ('  of which enterprise',     lambda q: q['erev']),
        ('Cash collected',            lambda q: q['crev']),
        ('COGS (model, data, SSO)',   lambda q: q['cogs']),
        ('Processing/bad debt/SLA',   lambda q: q['proc']),
        ('Payroll',                   lambda q: q['pay']),
        ('Office and people',         lambda q: q['ppl']),
        ('Operating and compliance',  lambda q: q['ops']),
        ('Sales and marketing',       lambda q: q['mkt']),
        ('EBITDA',                    lambda q: q['e']),
        ('Cash flow',                 lambda q: q['cf']),
    ]
    n = len(rows) // 12
    print(f"{'':<26}" + "".join(f"{'Year '+str(i+1):>14}" for i in range(n)))
    for label, f in lines:
        print(f"{label:<26}" + "".join(f"{v:>14,.0f}" for v in _years(rows, f)))
    rev = _years(rows, lambda q: q['rev'])
    gp = [rev[i] - _years(rows, lambda q: q['cogs'])[i] - _years(rows, lambda q: q['proc'])[i]
          for i in range(n)]
    print(f"{'Gross profit':<26}" + "".join(f"{v:>14,.0f}" for v in gp))
    print(f"{'Gross margin':<26}" + "".join(f"{gp[i]/rev[i]:>13.1%}" for i in range(n)))
    for i in range(n):
        x = rows[i*12 + 11]
        print(f"  Y{i+1} exit: SME {x['c']:>6,.0f} ({x['ann']:,.0f} annual) | enterprise {x['ent']:>3.0f} "
              f"(E1 {x['e1']:.0f}/E2 {x['e2']:.0f}/E3 {x['e3']:.0f}) | free {x['free']:>7,.0f} | "
              f"ARR {x['rev']*12:>13,.0f} | FTE {x['fte']:>2} | cum cash {x['cash']:>14,.0f}")
    # Thai corporate income tax with five-year loss carry-forward, and what BOI 8.1 exempts.
    pool, total = 0.0, 0.0
    for i, p in enumerate(_years(rows, lambda q: q['e'])):
        if p <= 0:
            pool += -p
            cit = 0.0
        else:
            taxable = max(0.0, p - pool)
            pool = max(0.0, pool - p)
            cit = taxable * 0.20
            total += cit
        print(f"  Y{i+1} pre-tax {p:>14,.0f} | loss pool {pool:>13,.0f} | CIT without BOI {cit:>12,.0f}")
    it_payroll = sum((hc(q['m'], q['c']).get('eng', 0) * SAL['eng']
                      + hc(q['m'], q['c']).get('sr_eng', 0) * SAL['sr_eng']
                      + hc(q['m'], q['c']).get('sec', 0) * SAL['sec']) * BON for q in rows)
    print(f"  CIT over the window without BOI {total:,.0f} | under BOI 0")
    print(f"  BOI 8.1 exemption ceiling (cumulative Thai IT payroll) {it_payroll:,.0f} "
          f"— {'binding' if it_payroll < total else 'not binding'}")


if __name__ == '__main__':
    base, be_b, peak_b, cash_b = run()
    routed, be_r, peak_r, cash_r = run(route_from=15)
    report('BASE — no routing engine', base)
    print(f"\n  peak cash {peak_b:,.0f} | EBITDA positive M{be_b} | cumulative cash positive M{cash_b}")
    report('ROUTED — §03 cost engine ships in month 15', routed)
    print(f"\n  peak cash {peak_r:,.0f} | EBITDA positive M{be_r} | cumulative cash positive M{cash_r}")
    print(f"\n  Routing engine is worth {routed[-1]['cash'] - base[-1]['cash']:,.0f} baht of cumulative "
          f"cash by month 60 and {peak_r - peak_b:,.0f} off the peak.")

    print(f"\n{'='*104}\nTHREE OUTLOOKS — 36-month view, the window a raise is priced against\n{'='*104}")
    outlooks = {
        'Pessimistic': dict(mul=.60, chm=.070, cha=.035, ann=.20, cac=1974., emul=.5),
        'Normal':      dict(),
        'Optimistic':  dict(mul=1.30, chm=.030, cha=.015, ann=.45, cac=6580., emul=1.5),
    }
    for name, kw in outlooks.items():
        rows, be, _, _ = run(**kw)
        rows = rows[:36]
        peak = min(q['cash'] for q in rows)
        positive = [q['m'] for q in rows if q['cash'] > 0]
        print(f"  {name:<12} M36 ARR {rows[-1]['rev']*12:>13,.0f} | Y3 EBITDA "
              f"{sum(q['e'] for q in rows[24:36]):>13,.0f} | EBITDA+ "
              f"{('M'+str(be)) if be and be <= 36 else 'beyond M36':>10} | cash+ "
              f"{('M'+str(positive[0])) if positive else 'beyond M36':>10} | peak {peak:>14,.0f}")
