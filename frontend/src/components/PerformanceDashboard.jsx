/**
 * PerformanceDashboard.jsx — Phase 6 (preview)
 * Automated Trading Performance Analytics
 *
 * Data sources:
 *   GET /api/performance/summary?days=N
 *   GET /api/auto/log?limit=500
 *   GET /api/account/status
 *
 * NOTE: Win/loss figures are EXPECTED (based on TP/SL at entry).
 * Realised P&L requires trade outcome tracking (Phase 6 full).
 */

import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const C = {
  bg:"#070d1a", surface:"#0f172a", surface2:"#111827",
  border:"#1e293b", border2:"#263347", text:"#e2e8f0", textDim:"#94a3b8",
  accent:"#f97316", blue:"#3b82f6", green:"#22c55e", red:"#ef4444",
  purple:"#8b5cf6", amber:"#f59e0b", mono:"'JetBrains Mono', monospace",
};

const SIGNAL_COLORS = {
  cone_boundary_fade:"#3b82f6", drift_momentum:"#8b5cf6",
  institutional_anchor:"#f97316", cone_convergence:"#22c55e",
  regime_transition:"#f59e0b", cone_breakout:"#ef4444",
};
const GRADE_COLORS  = {"A+":"#22c55e","A":"#4ade80","B":"#3b82f6","C":"#f59e0b","D":"#f97316","F":"#ef4444","?":"#64748b"};
const REGIME_COLORS = {calm:"#22c55e",normal:"#3b82f6",stressed:"#f97316",unknown:"#64748b"};
const PIP_SIZE = {
  EURUSD:0.0001,GBPUSD:0.0001,AUDUSD:0.0001,USDCHF:0.0001,USDCAD:0.0001,
  USDJPY:0.01,US500:1,USTEC:1,US30:1,GER40:1,UK100:1,
  XAUUSD:0.1,XAGUSD:0.001,XTIUSD:0.01,
};

const fmt = (n,d=2) => typeof n==="number" ? n.toFixed(d) : "—";
const pct = n => typeof n==="number" ? `${(n*100).toFixed(1)}%` : "—";
const usd = n => typeof n==="number" ? `$${n.toLocaleString("en-US",{maximumFractionDigits:0})}` : "—";
const mono = {fontFamily:C.mono,fontSize:11};

const TT = {
  contentStyle:{background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,fontFamily:C.mono},
  itemStyle:{color:C.text}, labelStyle:{color:C.textDim},
};

function SectionTitle({children,icon}) {
  return (
    <div style={{fontSize:10,fontWeight:700,fontFamily:C.mono,color:C.accent,
      letterSpacing:"0.1em",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
      {icon&&<span>{icon}</span>}{children}
    </div>
  );
}

function Card({children,style}) {
  return (
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:16,...style}}>
      {children}
    </div>
  );
}

function KpiCard({label,value,sub,color,note}) {
  return (
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,
      padding:"14px 16px",flex:1,minWidth:0}}>
      <div style={{fontSize:10,color:C.textDim,fontFamily:C.mono,letterSpacing:"0.06em",marginBottom:6}}>{label}</div>
      <div style={{fontSize:22,fontWeight:700,fontFamily:C.mono,color:color||C.text}}>{value}</div>
      {sub  && <div style={{fontSize:10,color:C.textDim,marginTop:3}}>{sub}</div>}
      {note && <div style={{fontSize:9,color:C.textDim,marginTop:2,fontStyle:"italic"}}>{note}</div>}
    </div>
  );
}

function exportCSV(records, filename) {
  if (!records.length) return;
  const cols = ["timestamp","action","ticker","direction","signal_type","confidence",
    "calibration_grade","risk_reward","risk_usd","risk_pct","entry_price","stop_loss",
    "take_profit","fill_price","slippage","lots","order_id","regime","mcs_score",
    "confirmation_edge","gate","reason","rationale"];
  const rows = [cols.join(",")];
  for (const r of records) {
    rows.push(cols.map(c => {
      const v = r[c] ?? "";
      const s = String(v).replace(/"/g,'""');
      return s.includes(",")||s.includes('"')||s.includes("\n") ? `"${s}"` : s;
    }).join(","));
  }
  const blob = new Blob([rows.join("\n")],{type:"text/csv;charset=utf-8;"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}

export default function PerformanceDashboard({serverUrl=""}) {
  const [days,setDays]       = useState(30);
  const [summary,setSummary] = useState(null);
  const [rawLog,setRawLog]   = useState([]);
  const [acct,setAcct]       = useState(null);
  const [loading,setLoading] = useState(true);
  const [error,setError]     = useState(null);
  const [activeTab,setTab]   = useState("overview");
  const [filter,setFilter]   = useState({ticker:"all",type:"all",action:"all"});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [sRes,lRes,aRes] = await Promise.all([
        fetch(`${serverUrl}/api/performance/summary?days=${days}`),
        fetch(`${serverUrl}/api/auto/log?limit=500`),
        fetch(`${serverUrl}/api/account/status`),
      ]);
      if (sRes.ok) setSummary(await sRes.json());
      if (lRes.ok) { const d=await lRes.json(); setRawLog(d.actions||[]); }
      if (aRes.ok) setAcct(await aRes.json());
    } catch { setError("Failed to load performance data"); }
    finally  { setLoading(false); }
  },[serverUrl,days]);

  useEffect(()=>{load();},[load]);

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",
      height:300,color:C.textDim,fontFamily:C.mono,fontSize:12}}>Loading performance data…</div>
  );
  if (error) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",
      height:300,color:C.red,fontFamily:C.mono,fontSize:12}}>{error}</div>
  );

  const s  = summary||{};
  const ne = s.total_executed??0;
  const allTickers = [...new Set(rawLog.map(r=>r.ticker).filter(Boolean))];
  const allTypes   = [...new Set(rawLog.map(r=>r.signal_type).filter(Boolean))];

  const DaySelector = () => (
    <div style={{display:"flex",gap:4}}>
      {[7,14,30,90].map(d => (
        <button key={d} onClick={()=>setDays(d)} style={{
          padding:"3px 10px",fontSize:10,fontFamily:C.mono,fontWeight:700,
          background:days===d?C.accent:"transparent",
          color:days===d?"#000":C.textDim,
          border:`1px solid ${days===d?C.accent:C.border}`,
          borderRadius:3,cursor:"pointer"}}>{d}D</button>
      ))}
    </div>
  );

  const GATE_LABELS = {
    executed:"Executed",dry_run:"Dry Run",confidence_threshold:"Conf ✗",
    calibration_grade:"Grade ✗",signal_type_whitelist:"Type ✗",
    ticker_whitelist:"Ticker ✗",existing_position:"Position ✗",
    state_filter:"State ✗",risk_governor:"Governor ✗",lots_invalid:"Lots ✗",
    awaiting_confirmation:"In Window",window_bypassed:"Bypassed",blocked:"Blocked",
  };

  const funnelData = Object.entries(s.funnel||{})
    .map(([k,v])=>({
      name:GATE_LABELS[k]||k, count:v,
      color:k==="executed"?C.green:k==="dry_run"?C.blue
        :k==="awaiting_confirmation"?C.amber:k==="window_bypassed"?C.purple:C.red,
    }))
    .sort((a,b)=>b.count-a.count);

  const timelineData = (s.timeline||[]).slice(-30);

  const tickerData = Object.entries(s.by_ticker||{})
    .map(([t,d])=>({name:t,count:d.count,risk:d.risk_usd,
      avg_win:d.avg_win_usd,avg_loss:d.avg_loss_usd,
      win_pips:d.avg_win_pips,loss_pips:d.avg_loss_pips,
      avg_confidence:d.avg_confidence}))
    .sort((a,b)=>b.count-a.count);

  const typeData = Object.entries(s.by_type||{})
    .map(([t,c])=>({name:t.replace(/_/g," ").replace("cone ","").replace("institutional ","inst "),
      fullName:t,count:c,color:SIGNAL_COLORS[t]||C.textDim}))
    .sort((a,b)=>b.count-a.count);

  const gradeData = Object.entries(s.by_grade||{})
    .map(([g,c])=>({name:g,count:c,color:GRADE_COLORS[g]||C.textDim}))
    .sort((a,b)=>["A+","A","B","C","D","F","?"].indexOf(a.name)-["A+","A","B","C","D","F","?"].indexOf(b.name));

  const regimeData = Object.entries(s.by_regime||{})
    .map(([r,c])=>({name:r,count:c,color:REGIME_COLORS[r]||C.textDim}));

  return (
    <div style={{background:C.bg,minHeight:"100%",padding:20,color:C.text,overflowY:"auto"}}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{fontSize:16,fontWeight:700,fontFamily:C.mono,color:C.accent,letterSpacing:"0.05em"}}>PERFORMANCE</div>
          <div style={{fontSize:11,color:C.textDim,marginTop:2}}>
            {ne} executed · {s.total_records||0} total decisions · last {days} days
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <DaySelector />
          <button onClick={()=>exportCSV(rawLog,`mk_trades_log_${days}d.csv`)} style={{
            padding:"3px 10px",fontSize:10,fontFamily:C.mono,background:"transparent",
            border:`1px solid ${C.border}`,color:C.textDim,borderRadius:3,cursor:"pointer"}}>
            ⬇ EXPORT CSV
          </button>
          <button onClick={load} style={{
            padding:"3px 10px",fontSize:10,fontFamily:C.mono,background:"transparent",
            border:`1px solid ${C.border}`,color:C.textDim,borderRadius:3,cursor:"pointer"}}>
            ↺ REFRESH
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:0,marginBottom:20,borderBottom:`1px solid ${C.border}`}}>
        {[["overview","OVERVIEW"],["trades","TRADE LOG"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{
            padding:"6px 16px",fontSize:11,fontWeight:700,fontFamily:C.mono,
            background:"transparent",border:"none",
            borderBottom:activeTab===id?`2px solid ${C.accent}`:"2px solid transparent",
            color:activeTab===id?C.accent:C.textDim,cursor:"pointer",letterSpacing:"0.06em"}}>
            {label}
          </button>
        ))}
      </div>

      {activeTab==="overview" && (
        <>
          {/* KPI row */}
          <div style={{display:"flex",gap:12,marginBottom:20}}>
            <KpiCard label="EXECUTED TRADES" value={ne} sub={`Last ${days} days`} />
            <KpiCard label="AVG CONFIDENCE" value={pct(s.avg_confidence)}
              color={s.avg_confidence>0.7?C.green:s.avg_confidence>0.55?C.amber:C.red} />
            <KpiCard label="AVG R:R" value={`${fmt(s.avg_risk_reward,1)}R`}
              color={s.avg_risk_reward>=2?C.green:s.avg_risk_reward>=1?C.amber:C.red} />
            {acct && <KpiCard label="EQUITY" value={usd(acct.equity||acct.current_equity)} sub="Current account" color={C.green} />}
          </div>

          {/* Win/Loss row */}
          <div style={{display:"flex",gap:12,marginBottom:20}}>
            <Card style={{flex:1}}>
              <SectionTitle icon="✅">EXPECTED WIN (per trade)</SectionTitle>
              <div style={{display:"flex",gap:24}}>
                <div>
                  <div style={{fontSize:24,fontWeight:700,fontFamily:C.mono,color:C.green}}>{usd(s.avg_win_usd)}</div>
                  <div style={{fontSize:10,color:C.textDim,marginTop:2}}>avg in USD</div>
                </div>
                <div>
                  <div style={{fontSize:24,fontWeight:700,fontFamily:C.mono,color:C.green}}>{fmt(s.avg_win_pips,0)} pips</div>
                  <div style={{fontSize:10,color:C.textDim,marginTop:2}}>avg distance to TP</div>
                </div>
              </div>
              <div style={{fontSize:9,color:C.textDim,marginTop:8,fontStyle:"italic"}}>
                Entry → take profit at execution time (expected, not realised)
              </div>
            </Card>

            <Card style={{flex:1}}>
              <SectionTitle icon="❌">RISK PER TRADE (potential loss)</SectionTitle>
              <div style={{display:"flex",gap:24}}>
                <div>
                  <div style={{fontSize:24,fontWeight:700,fontFamily:C.mono,color:C.red}}>{usd(s.avg_loss_usd)}</div>
                  <div style={{fontSize:10,color:C.textDim,marginTop:2}}>avg per trade</div>
                </div>
                <div>
                  <div style={{fontSize:24,fontWeight:700,fontFamily:C.mono,color:C.red}}>{fmt(s.avg_loss_pips,0)} pips</div>
                  <div style={{fontSize:10,color:C.textDim,marginTop:2}}>avg distance to SL</div>
                </div>
              </div>
              <div style={{fontSize:9,color:C.textDim,marginTop:8,fontStyle:"italic"}}>
                Entry → stop loss at execution time (max loss if stopped out)
              </div>
            </Card>

            <Card style={{flex:1}}>
              <SectionTitle icon="💰">TOTAL CAPITAL AT RISK</SectionTitle>
              <div style={{fontSize:24,fontWeight:700,fontFamily:C.mono,color:C.amber}}>{usd(s.total_risk_usd)}</div>
              <div style={{fontSize:10,color:C.textDim,marginTop:2}}>
                across {ne} trades · avg {typeof s.avg_risk_pct === "number" ? s.avg_risk_pct.toFixed(2) + "%" : "—"} per trade
              </div>
              <div style={{fontSize:9,color:C.textDim,marginTop:8,fontStyle:"italic"}}>
                Sum of all SL distances × lots — max downside if every trade hits stop
              </div>
            </Card>
          </div>

          {/* Gate funnel + timeline */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1.6fr",gap:12,marginBottom:12}}>
            <Card>
              <SectionTitle icon="⛩">SIGNAL GATE FUNNEL</SectionTitle>
              <div style={{fontSize:9,color:C.textDim,marginBottom:8}}>
                How many signals passed or were filtered at each gate
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={funnelData} layout="vertical" margin={{left:10,right:20}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                  <XAxis type="number" tick={{...mono,fill:C.textDim}} />
                  <YAxis type="category" dataKey="name" tick={{...mono,fill:C.textDim}} width={90} />
                  <Tooltip {...TT} />
                  <Bar dataKey="count" radius={[0,3,3,0]}>
                    {funnelData.map((e,i)=><Cell key={i} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <SectionTitle icon="📅">DAILY ACTIVITY</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={timelineData} margin={{left:-10,right:10}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="date" tick={{...mono,fill:C.textDim,fontSize:9}} tickFormatter={d=>d.slice(5)} />
                  <YAxis tick={{...mono,fill:C.textDim}} />
                  <Tooltip {...TT} labelFormatter={d=>`Date: ${d}`} />
                  <Legend wrapperStyle={{...mono,color:C.textDim}} />
                  <Bar dataKey="executed"  name="Executed"  stackId="a" fill={C.green} />
                  <Bar dataKey="dry_run"   name="Dry Run"   stackId="a" fill={C.blue} />
                  <Bar dataKey="awaiting"  name="In Window" stackId="a" fill={C.amber} />
                  <Bar dataKey="skipped"   name="Skipped"   stackId="a" fill={C.border2} />
                  <Bar dataKey="blocked"   name="Blocked"   stackId="a" fill={C.red} radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Per-ticker table */}
          {tickerData.length>0 && (
            <Card style={{marginBottom:12}}>
              <SectionTitle icon="💱">PER-TICKER BREAKDOWN (executed trades only)</SectionTitle>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:C.mono}}>
                  <thead>
                    <tr style={{background:C.surface2}}>
                      {["TICKER","TRADES","AVG WIN $","AVG WIN PIPS","AVG LOSS $","AVG LOSS PIPS","AVG CONF","TOTAL RISK $"].map(h=>(
                        <th key={h} style={{padding:"7px 12px",textAlign:"left",color:C.textDim,
                          fontWeight:700,letterSpacing:"0.06em",whiteSpace:"nowrap",
                          borderBottom:`1px solid ${C.border}`,fontSize:10}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tickerData.map((r,i)=>(
                      <tr key={r.name} style={{background:i%2===0?C.surface:C.bg,borderBottom:`1px solid ${C.border}`}}>
                        <td style={{padding:"6px 12px",color:C.accent,fontWeight:700}}>{r.name}</td>
                        <td style={{padding:"6px 12px",color:C.text}}>{r.count}</td>
                        <td style={{padding:"6px 12px",color:C.green,fontWeight:700}}>{usd(r.avg_win)}</td>
                        <td style={{padding:"6px 12px",color:C.green}}>{fmt(r.win_pips,0)}</td>
                        <td style={{padding:"6px 12px",color:C.red}}>{usd(r.avg_loss)}</td>
                        <td style={{padding:"6px 12px",color:C.red}}>{fmt(r.loss_pips,0)}</td>
                        <td style={{padding:"6px 12px",
                          color:r.avg_confidence>0.75?C.green:r.avg_confidence>0.6?C.amber:C.red}}>
                          {pct(r.avg_confidence)}
                        </td>
                        <td style={{padding:"6px 12px",color:C.amber}}>{usd(r.risk)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Distributions */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:12}}>
            <Card>
              <SectionTitle icon="📡">BY SIGNAL TYPE</SectionTitle>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {typeData.map(({name,fullName,count,color})=>{
                  const max=typeData[0]?.count||1;
                  return (
                    <div key={fullName}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                        <span style={{...mono,color:C.text,fontSize:10}}>{name}</span>
                        <span style={{...mono,color:C.textDim}}>{count}</span>
                      </div>
                      <div style={{height:4,background:C.border,borderRadius:2,overflow:"hidden"}}>
                        <div style={{width:`${(count/max)*100}%`,height:"100%",background:color,borderRadius:2}} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <SectionTitle icon="🎯">BY GRADE</SectionTitle>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={gradeData} margin={{left:-20,right:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="name" tick={{...mono,fill:C.textDim}} />
                  <YAxis tick={{...mono,fill:C.textDim}} />
                  <Tooltip {...TT} />
                  <Bar dataKey="count" radius={[3,3,0,0]}>
                    {gradeData.map((e,i)=><Cell key={i} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <SectionTitle icon="🌡">BY REGIME</SectionTitle>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={regimeData} dataKey="count" nameKey="name"
                    cx="50%" cy="50%" outerRadius={55}
                    label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}
                    labelLine={{stroke:C.border}}
                    style={{fontSize:9,fontFamily:C.mono}}>
                    {regimeData.map((e,i)=><Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip {...TT} />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <SectionTitle icon="↕">DIRECTION SPLIT</SectionTitle>
              <div style={{display:"flex",gap:20,alignItems:"center",marginTop:10}}>
                {Object.entries(s.by_direction||{}).map(([dir,count])=>(
                  <div key={dir} style={{textAlign:"center"}}>
                    <div style={{fontSize:28,fontWeight:700,fontFamily:C.mono,
                      color:dir==="long"?C.green:C.red}}>{count}</div>
                    <div style={{fontSize:10,color:C.textDim,fontFamily:C.mono,letterSpacing:"0.06em"}}>
                      {dir.toUpperCase()}
                    </div>
                  </div>
                ))}
              </div>
              {s.by_direction&&(()=>{
                const total=(s.by_direction.long||0)+(s.by_direction.short||0);
                const lp=total>0?(s.by_direction.long/total)*100:50;
                return (
                  <div style={{marginTop:12}}>
                    <div style={{height:8,background:C.border,borderRadius:4,overflow:"hidden",display:"flex"}}>
                      <div style={{width:`${lp}%`,background:C.green}} />
                      <div style={{width:`${100-lp}%`,background:C.red}} />
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                      <span style={{...mono,color:C.green,fontSize:10}}>L {total?pct(s.by_direction.long/total):"—"}</span>
                      <span style={{...mono,color:C.red,fontSize:10}}>S {total?pct(s.by_direction.short/total):"—"}</span>
                    </div>
                  </div>
                );
              })()}
            </Card>
          </div>

          {/* Skipped by gate */}
          <Card>
            <SectionTitle icon="🚧">SKIPPED BY GATE</SectionTitle>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {Object.entries(s.by_gate||{}).sort((a,b)=>b[1]-a[1]).map(([gate,count])=>(
                <div key={gate} style={{background:C.surface2,border:`1px solid ${C.border}`,
                  borderRadius:4,padding:"4px 10px",display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{...mono,color:C.textDim,fontSize:10}}>{gate.replace(/_/g," ")}</span>
                  <span style={{...mono,color:C.red,fontWeight:700,fontSize:11}}>{count}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {activeTab==="trades" && (
        <TradeLog records={rawLog} allTickers={allTickers} allTypes={allTypes}
          filter={filter} setFilter={setFilter} />
      )}
    </div>
  );
}

function TradeLog({records,allTickers,allTypes,filter,setFilter}) {
  const filtered = records.filter(r=>{
    if (filter.action!=="all"&&r.action!==filter.action) return false;
    if (filter.ticker!=="all"&&r.ticker!==filter.ticker) return false;
    if (filter.type!=="all"&&r.signal_type!==filter.type) return false;
    return true;
  }).slice().reverse();

  const actionOpts=["executed","dry_run","skipped","blocked","awaiting_confirmation","window_bypassed"];

  const sel=(key,opts)=>(
    <select value={filter[key]} onChange={e=>setFilter(f=>({...f,[key]:e.target.value}))}
      style={{background:C.surface,border:`1px solid ${C.border}`,color:C.text,
        padding:"3px 8px",fontSize:10,fontFamily:C.mono,borderRadius:3,cursor:"pointer"}}>
      <option value="all">ALL {key.toUpperCase()}S</option>
      {opts.map(v=><option key={v} value={v}>{v}</option>)}
    </select>
  );

  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
        {sel("action",actionOpts)} {sel("ticker",allTickers)} {sel("type",allTypes)}
        <span style={{...mono,color:C.textDim,fontSize:10,marginLeft:4}}>{filtered.length} records</span>
        <button onClick={()=>exportCSV(filtered,"mk_trades_filtered.csv")}
          style={{marginLeft:"auto",padding:"3px 10px",fontSize:10,fontFamily:C.mono,
            background:"transparent",border:`1px solid ${C.border}`,color:C.textDim,
            borderRadius:3,cursor:"pointer"}}>
          ⬇ EXPORT FILTERED
        </button>
      </div>

      <div style={{border:`1px solid ${C.border}`,borderRadius:6,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:10,fontFamily:C.mono}}>
          <thead>
            <tr style={{background:C.surface2}}>
              {["TIME","ACTION","TICKER","DIR","TYPE","CONF","GRADE","WIN $","WIN PIPS","LOSS $","LOSS PIPS","R:R","DETAIL"].map(h=>(
                <th key={h} style={{padding:"7px 10px",textAlign:"left",color:C.textDim,
                  fontWeight:700,letterSpacing:"0.06em",whiteSpace:"nowrap",
                  borderBottom:`1px solid ${C.border}`,fontSize:9}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0,100).map((r,i)=>{
              const isExec=r.action==="executed";
              const isDry=r.action==="dry_run";
              const actionColor=isExec?C.green:isDry?C.blue:r.action==="skipped"?C.textDim:r.action==="blocked"?C.red:C.amber;
              const entry=r.fill_price||r.entry_price||0;
              const pip=PIP_SIZE[r.ticker]||0.0001;
              const winPips  = entry&&r.take_profit ? Math.abs(r.take_profit-entry)/pip : null;
              const lossPips = entry&&r.stop_loss   ? Math.abs(entry-r.stop_loss)/pip   : null;
              const winUsd   = r.risk_usd&&r.risk_reward ? r.risk_usd*r.risk_reward : null;
              return (
                <tr key={i} style={{background:i%2===0?C.surface:C.bg,borderBottom:`1px solid ${C.border}`}}>
                  <td style={{padding:"5px 10px",color:C.textDim,whiteSpace:"nowrap"}}>
                    {r.timestamp?r.timestamp.slice(5,16).replace("T"," "):"—"}
                  </td>
                  <td style={{padding:"5px 10px"}}>
                    <span style={{color:actionColor,fontWeight:700,fontSize:9,letterSpacing:"0.04em"}}>
                      {r.action?.replace(/_/g," ").toUpperCase()}
                    </span>
                  </td>
                  <td style={{padding:"5px 10px",color:C.text,fontWeight:isExec?700:400}}>{r.ticker||"—"}</td>
                  <td style={{padding:"5px 10px",color:r.direction==="long"?C.green:r.direction==="short"?C.red:C.textDim}}>
                    {r.direction?.toUpperCase()||"—"}
                  </td>
                  <td style={{padding:"5px 10px",color:C.textDim,fontSize:9}}>{r.signal_type?.replace(/_/g," ")||"—"}</td>
                  <td style={{padding:"5px 10px",color:r.confidence>0.75?C.green:r.confidence>0.6?C.amber:C.textDim}}>
                    {r.confidence?pct(r.confidence):"—"}
                  </td>
                  <td style={{padding:"5px 10px",color:GRADE_COLORS[r.calibration_grade]||C.textDim}}>
                    {r.calibration_grade||"—"}
                  </td>
                  <td style={{padding:"5px 10px",color:winUsd?C.green:C.textDim}}>{winUsd?usd(winUsd):"—"}</td>
                  <td style={{padding:"5px 10px",color:winPips?C.green:C.textDim}}>{winPips?winPips.toFixed(0):"—"}</td>
                  <td style={{padding:"5px 10px",color:r.risk_usd?C.red:C.textDim}}>{r.risk_usd?usd(r.risk_usd):"—"}</td>
                  <td style={{padding:"5px 10px",color:lossPips?C.red:C.textDim}}>{lossPips?lossPips.toFixed(0):"—"}</td>
                  <td style={{padding:"5px 10px",color:r.risk_reward>=2?C.green:r.risk_reward>=1?C.amber:C.textDim}}>
                    {r.risk_reward?`${fmt(r.risk_reward,1)}R`:"—"}
                  </td>
                  <td style={{padding:"5px 10px",color:C.textDim,fontSize:9,maxWidth:160,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {r.reason||r.gate||(isExec&&r.order_id?`#${r.order_id}`:"")||(isDry?"log only":"")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length>100&&(
          <div style={{padding:"8px 12px",color:C.textDim,fontSize:10,fontFamily:C.mono,
            textAlign:"center",borderTop:`1px solid ${C.border}`}}>
            Showing 100 of {filtered.length} — export CSV for full data
          </div>
        )}
      </div>
    </div>
  );
}