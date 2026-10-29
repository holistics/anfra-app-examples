# /// script
# requires-python = ">=3.10"
# dependencies = ["duckdb==1.5.6"]
# ///
"""Deterministic synthetic publisher world. Writes a NEW database, never the source.

Run with duckdb installed: python seed-galaxy-demo.py --output /path/galaxy-demo.duckdb
All values are simulated. First-use funnels share a cohort; returning users are daily
activity, not a sequential conversion denominator. Recent cohorts are right-censored.
"""
from pathlib import Path
from datetime import date,timedelta
import argparse,json,math,random,hashlib
import duckdb
HERE=Path(__file__).resolve().parent
START=date(2023,1,1); END=date(2026,10,20)
PROFILES={
1:('Complete first puzzle','Complete puzzles on another day','puzzle_completed',120,.52,.45,.018,4.99),
2:('Complete first workout','Complete another planned workout','workout_completed',85,.48,.36,.027,7.99),
3:('Prepare a saved recipe','Prepare another saved recipe','recipe_prepared',50,.55,.30,.016,3.99),
4:('Complete first lesson','Complete a lesson on another day','lesson_completed',90,.58,.32,.032,6.99),
5:('Create a budget and log spending','Review budget and log spending again','budget_reviewed',60,.46,.40,.025,5.99),
6:('Finish a sleep session','Finish a sleep session on another night','sleep_session_completed',75,.68,.27,.034,4.99),
7:('Export first finished edit','Export an edit on another day','edit_exported',100,.62,.49,.022,4.99),
8:('Complete first word challenge','Complete another word challenge','challenge_completed',110,.56,.43,.019,3.99),
9:('Finish a meditation session','Finish another meditation session','meditation_completed',65,.64,.31,.031,6.99),
10:('Create a plan and complete a task','Complete planned work on another day','planned_work_completed',55,.50,.38,.023,4.99),
}
def seed(output):
 if output.exists():raise ValueError('Use a new output path; existing databases are never overwritten.')
 c=duckdb.connect(str(output));c.execute('BEGIN TRANSACTION');dims=json.loads((HERE/'demo-dimensions.json').read_text())
 # Same physical schema as publisher. The isolated semantic models reference this source only.
 schema={
 'dim_apps':'app_key INTEGER,app_id VARCHAR,name VARCHAR,platform VARCHAR,bundle_id VARCHAR,category VARCHAR,squad_key INTEGER',
 'dim_campaigns':'campaign_key INTEGER,campaign_id VARCHAR,app_key INTEGER,name VARCHAR,channel VARCHAR,view_type VARCHAR,budget DECIMAL(18,3),start_date DATE,end_date DATE,status VARCHAR,thumbnail_url VARCHAR',
 'dim_squads':'squad_key INTEGER,squad_name VARCHAR,squad_code VARCHAR,squad_focus VARCHAR',
 }
 # Preserve exact dimension column types through a CSV-free JSON schema descriptor.
 for t in dims:
  cols=dims[t]['columns'];rows=dims[t]['rows']
  types=[]
  for col in cols:
   types.append('INTEGER' if col.endswith('_key') else 'DATE' if col in ('start_date','end_date') else 'DECIMAL(18,3)' if col=='budget' else 'VARCHAR')
  c.execute('CREATE TABLE '+t+' ('+','.join(a+' '+b for a,b in zip(cols,types))+')')
  if rows:c.executemany('INSERT INTO '+t+' VALUES ('+','.join('?' for _ in cols)+')',rows)
 c.execute('CREATE TABLE dim_dates(date_key INTEGER,date DATE,year INTEGER,quarter INTEGER,month INTEGER,month_name VARCHAR,week INTEGER,day_of_week INTEGER,day_name VARCHAR,is_weekend BOOLEAN)')
 dates=[];d=START
 while d<=END:
  dates.append((int(d.strftime('%Y%m%d')),d,d.year,(d.month-1)//3+1,d.month,d.strftime('%B'),d.isocalendar().week,d.isoweekday(),d.strftime('%A'),d.weekday()>=5));d+=timedelta(days=1)
 c.executemany('INSERT INTO dim_dates VALUES (?,?,?,?,?,?,?,?,?,?)',dates)
 c.execute('CREATE TABLE fact_daily_spend(id INTEGER,date_key INTEGER,campaign_key INTEGER,app_key INTEGER,impressions INTEGER,clicks INTEGER,installs INTEGER,spend_amount DECIMAL(18,3),re_attributions INTEGER,re_engagements INTEGER,organic_installs INTEGER)')
 c.execute('CREATE TABLE fact_revenue(revenue_id VARCHAR,date_key INTEGER,app_key INTEGER,campaign_key INTEGER,country_key INTEGER,revenue_type VARCHAR,amount DECIMAL(18,3),currency VARCHAR,product_id VARCHAR)')
 c.execute('CREATE TABLE fact_events(id INTEGER,date_key INTEGER,app_key INTEGER,campaign_key INTEGER,event_key INTEGER,unique_users INTEGER,event_count INTEGER,event_revenue DECIMAL(18,3))')
 c.execute('CREATE TABLE fact_daily_active_users(id INTEGER,date_key INTEGER,app_key INTEGER,active_users INTEGER,new_users INTEGER)')
 growthcols=['awareness','store_visits','installs','first_opens','onboarded','activated','repeat_value','referrers','referred_installs','paying_users','sessions','successful_sessions','crash_free_sessions','total_sessions','uninstalls','reactivated','search_impressions','search_visits','rating_count','rating_sum']
 c.execute('CREATE TABLE fact_growth_daily(id INTEGER,date_key INTEGER,app_key INTEGER,'+','.join(x+' BIGINT' for x in growthcols)+')')
 # Four paid campaigns and one organic attribution bucket per app, including 2026 waves.
 campaignRows=[];keys={};nameById={r[0]:r[2] for r in dims['dim_apps']['rows']}
 for a in PROFILES:
  for j,channel in enumerate(['Google Ads','Facebook Ads','TikTok','AppLovin','Organic']):
   key=100+a*10+j;keys[a,j]=key
   campaignRows.append((key,f'demo_{a}_{j}',a,('Organic discovery' if j==4 else ['Evergreen search','Creative refresh','Autumn acquisition','Returning users'][j])+' · '+nameById[a],channel,'retargeting' if j==3 else 'ua',100000,date(2024,9,1) if a==10 else START,None,'active',''))
 c.executemany('INSERT INTO dim_campaigns VALUES (?,?,?,?,?,?,?,?,?,?,?)',campaignRows)
 # Keep original campaign names working, but derive dates from their actual generated history.
 original={a:[] for a in PROFILES}
 for row in dims['dim_campaigns']['rows']:
  if row[4]!='Organic':original[row[2]].append(row)
 spend=[];rev=[];events=[];active=[];growth=[];rng=random.Random(20261020);ident=0;rid=0;eid=0
 channels=['Google Ads','Facebook Ads','TikTok','AppLovin']
 for a,profile in PROFILES.items():
  activation,repeat,event,base,activateBase,decay,payRate,price=profile
  country=[1,2,3,4,5,6,7,8,9,10]
  # Specific success events retain their semantic meaning in raw product data.
  eventKey=100+a
  eventCols=dims['dim_events']['columns']
  ev=[eventKey if col=='event_key' else event if col=='event_name' else 'core_value' for col in eventCols]
  c.execute('INSERT INTO dim_events VALUES ('+','.join('?' for _ in ev)+')',ev)
  audience=base*7;prevInstalls=[]
  for i,entry in enumerate(dates):
   dk,day=entry[:2]
   if a==10 and day<date(2024,9,1):continue
   yearphase=2*math.pi*day.timetuple().tm_yday/365.25
   weekday=[.96,1.02,1.04,1.01,1.00,1.12,1.08][day.weekday()] if a in [1,8] else [1.15,1.11,1.05,1.02,.99,.80,.82][day.weekday()]
   # App-specific trend, annual seasonality, correlated weekly noise, and bounded interventions.
   trend=1+(i/len(dates))*(.18+.07*(a%4))
   annual=1+.13*math.sin(yearphase+(a*.57))
   january=1.27 if day.month==1 and a in [2,5,9,10] else 1
   promo=1+.38*math.exp(-((day-date(2026,8,15)).days/23)**2) if a in [1,7,8] else 1
   aso=1+.26/(1+math.exp(-max(-500,min(500,(day-date(2026,7,1)).days/17)))) if a in [3,4,10] else 1
   incident=(.70 if date(2026,9,10)<=day<=date(2026,9,17) and a==7 else 1)
   new=max(8,round(base*trend*annual*weekday*january*promo*rng.lognormvariate(-.008,.12)))
   org=max(1,round(new*(.22+.025*(a%4))*aso));paid=max(0,new-org);new=paid+org
   # Acquisition rows reconcile exactly with install records and cohort D0.
   weights=[.36,.30,.22,.12];allocated=0;amounts=[]
   for j,w in enumerate(weights):
    n=paid-allocated if j==3 else round(paid*w);allocated+=n
    cpi=(1.2+.22*a)*[1.0,1.12,.84,.68][j]*(1+.10*math.sin(i/31+j))*rng.uniform(.93,1.07)
    sp=round(n*cpi,2);im=max(n*15,round(n*55*rng.uniform(.85,1.15)));click=max(n,round(im*(.035+.006*j)))
    # Original names remain populated over their recorded campaign lives.
    old=[x for x in original[a] if x[5]==channels[j] and (not x[8] or date.fromisoformat(x[8])<=day) and (not x[9] or day<=date.fromisoformat(x[9]))]
    key=old[0][0] if old and day.year<2026 else keys[a,j]
    ident+=1;spend.append((ident,dk,key,a,im,click,n,sp,round(n*.03),round(n*.1),0));amounts.append((key,n))
   ident+=1;spend.append((ident,dk,keys[a,4],a,0,0,0,0,0,0,org));amounts.append((keys[a,4],org))
   # Daily user-days, with finite churn. Unlike the old flat retention tail, the audience cannot grow forever.
   audience=audience*(.965+.002*(a%3))+new*.76
   dau=max(new,round(audience*weekday*incident*rng.uniform(.96,1.04)))
   opens=round(new*(.86+.02*math.sin(i/23+a)));onboard=round(opens*(.72+.04*math.sin(i/67+a)))
   improve=.09/(1+math.exp(-max(-500,min(500,(day-date(2026,5,10)).days/19))))
   activated=min(onboard,round(onboard*(activateBase+improve)*incident))
   returning=max(0,dau-opens);repeatN=round(returning*(.55+.06*math.sin(i/45+a)))
   referrers=round(repeatN*(.018+.004*(a%5)));referred=min(org,round(referrers*.24))
   payers=max(1,round(dau*payRate*(1+.1*math.sin(i/40+a))))
   sessions=round(dau*(1.3+.15*(a%4))*rng.uniform(.95,1.05));crashRate=.003+.001*(a%3)+.0015*(1+.7*math.sin(i/37+a))+(.035 if incident<1 else 0)
   crashfree=sessions-round(sessions*crashRate);successful=round(sessions*(.915+.008*(a%4)+.012*math.sin(i/43+a)-(.09 if incident<1 else 0)))
   visits=max(new,round(new/(.28+.025*(a%5)+.018*math.sin(i/29+a)+.025*(aso-1))));awareness=round(visits/(.035+.004*(a%4)))
   ratings=max(1,round(dau*.007));ratingSum=round(ratings*(3.9+.3*math.sin(i/60+a)-(.7 if incident<1 else 0)))
   grow=(awareness,visits,new,opens,onboard,activated,repeatN,referrers,referred,payers,sessions,successful,crashfree,sessions,round(dau*.018),round(returning*.025),round(visits*4.4),round(visits*.45),ratings,max(ratings,min(5*ratings,ratingSum)))
   growth.append((len(growth)+1,dk,a,*grow));active.append((len(active)+1,dk,a,dau,new))
   # Financial facts share the generated demand, with category-specific monetization mixes.
   mix=[.60,.15,.25] if a in [1,8] else [.25,.65,.10] if a in [2,4,5,6,9,10] else [.40,.35,.25]
   total=payers*price+round(dau*.025,2)
   for typ,weight in zip(['iap','subscription','ad_impression'],mix):
    for key,n in amounts:
     value=round(total*weight*n/new,2)
     if value:rid+=1;rev.append((f'demo_rev_{rid}',dk,a,key,country[(i+key)%10],typ,value,'USD',f'demo_{typ}_{a}'))
   for ekey,users,count,er in [(eventKey,activated+repeatN,successful,0),(1,dau,sessions,0)]:
    eid+=1;events.append((eid,dk,a,keys[a,4],ekey,users,count,er))
 c.executemany('INSERT INTO fact_daily_spend VALUES (?,?,?,?,?,?,?,?,?,?,?)',spend)
 c.executemany('INSERT INTO fact_revenue VALUES (?,?,?,?,?,?,?,?,?)',rev)
 c.executemany('INSERT INTO fact_events VALUES (?,?,?,?,?,?,?,?)',events)
 c.executemany('INSERT INTO fact_daily_active_users VALUES (?,?,?,?,?)',active)
 c.executemany('INSERT INTO fact_growth_daily VALUES ('+','.join('?' for _ in range(23))+')',growth)
 # One install record per daily paid/organic install; deterministic varied attribution details.
 c.execute("""CREATE TABLE fact_installs AS SELECT 'demo_install_'||s.id||'_'||n.i AS install_id,s.date_key,s.app_key,s.campaign_key,1+((n.i+s.date_key+s.app_key)%10)::INTEGER AS country_key,CASE WHEN n.i%4=0 THEN 'tablet' ELSE 'mobile' END AS device_type,c.channel AS attribution_source,(s.organic_installs>0) AS is_organic FROM fact_daily_spend s JOIN dim_campaigns c USING(campaign_key) CROSS JOIN LATERAL range(0,(s.installs+s.organic_installs)::BIGINT) n(i)""")
 # Stable cohort decay varies by app and acquisition date; no immature future observations.
 c.execute("""CREATE TABLE fact_cohort_revenue AS SELECT row_number() OVER ()::INTEGER AS id,s.date_key AS install_date_key,s.app_key,s.campaign_key,d.day_number::INTEGER AS day_number,(s.installs+s.organic_installs)::INTEGER AS cohort_installs,round((s.installs+s.organic_installs)*(2+s.app_key*.35)*(1-exp(-d.day_number/14.0)),3)::DECIMAL(18,3) AS cumulative_revenue,CASE WHEN d.day_number=0 THEN s.installs+s.organic_installs ELSE floor((s.installs+s.organic_installs)*(0.025+(0.97)*exp(-(0.36+s.app_key%5*.045-CASE WHEN s.date_key>=20260510 THEN .035 ELSE 0 END)*pow(d.day_number,.67)))+(hash(s.id)%100000)/100000.0)::INTEGER END AS retained_users FROM fact_daily_spend s CROSS JOIN range(0,29) d(day_number) WHERE s.installs+s.organic_installs>0 AND strptime(s.date_key::VARCHAR,'%Y%m%d')::DATE+d.day_number::INTEGER<=DATE '2026-10-20'""")
 c.execute('COMMIT');c.execute('CHECKPOINT')
 # Completion report is a data-quality contract, not a performance benchmark.
 checks={
 'date_end':str(c.execute('SELECT max(date) FROM dim_dates').fetchone()[0])=='2026-10-20',
 'daily_growth_unique':c.execute('SELECT count(*)=count(distinct (app_key,date_key)) FROM fact_growth_daily').fetchone()[0],
 'funnel_order':c.execute('SELECT count(*) FROM fact_growth_daily WHERE activated>onboarded OR onboarded>first_opens OR first_opens>installs OR installs>store_visits OR store_visits>awareness').fetchone()[0]==0,
 'quality_order':c.execute('SELECT count(*) FROM fact_growth_daily WHERE crash_free_sessions>total_sessions OR successful_sessions>sessions OR rating_sum>5*rating_count OR rating_sum<rating_count').fetchone()[0]==0,
 'installs_reconcile':c.execute('SELECT sum(installs+organic_installs)=(SELECT count(*) FROM fact_installs) FROM fact_daily_spend').fetchone()[0],
 'd0_reconcile':c.execute('SELECT sum(installs+organic_installs)=(SELECT sum(cohort_installs) FROM fact_cohort_revenue WHERE day_number=0) FROM fact_daily_spend').fetchone()[0],
 'no_future_cohorts':c.execute("SELECT count(*) FROM fact_cohort_revenue WHERE strptime(install_date_key::VARCHAR,'%Y%m%d')::DATE+day_number>DATE '2026-10-20'").fetchone()[0]==0,
 'no_orphan_campaigns':c.execute('SELECT count(*) FROM fact_daily_spend s LEFT JOIN dim_campaigns c USING(campaign_key) WHERE c.campaign_key IS NULL OR s.app_key<>c.app_key').fetchone()[0]==0,
 'retained_bounded':c.execute('SELECT count(*) FROM fact_cohort_revenue WHERE retained_users<0 OR retained_users>cohort_installs').fetchone()[0]==0,
 'nonidentical_apps':c.execute('SELECT count(distinct activated)>5 FROM fact_growth_daily WHERE date_key=20261020').fetchone()[0],
 }
 rows={t:c.execute('SELECT count(*) FROM '+t).fetchone()[0] for t in ['fact_growth_daily','fact_daily_spend','fact_installs','fact_cohort_revenue','fact_revenue','fact_events','fact_daily_active_users']}
 profileData={nameById[a]:{'activation':v[0],'repeat':v[1],'event':v[2]} for a,v in PROFILES.items()}
 report={'synthetic':True,'seed':20261020,'start':str(START),'end':str(END),'checks':checks,'rows':rows,'profiles':profileData,'scenarios':['Weekly use differs by app','New Year fitness and planning demand','Summer game acquisition pulse','July ASO improvement','May activation improvement','September Photo Editor quality incident and recovery'],'definitions':{'newUserFunnel':'Same acquisition-day synthetic cohort with ordered first use','returningUsers':'Daily repeat-value users, additive as user-days only','awareness':'Impressions, not unique people','cohorts':'Same acquisition installs, only observable ages','revenue':'Recorded synthetic receipts, not profit','cohortRevenue':'Modeled cohort receipts, not a causal attribution claim'}}
 if not all(checks.values()):raise ValueError(checks)
 (HERE/'demo-seed-checks.json').write_text(json.dumps(report,indent=2)+'\n');(HERE/'demo-app-profiles.json').write_text(json.dumps(profileData,indent=2)+'\n')
 c.close();print(json.dumps({'passed':True,'rows':rows,'checks':checks}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);seed(p.parse_args().output)
