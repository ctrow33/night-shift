"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { supabase } from "../lib/supabase";
import { PEOPLE, byId } from "../lib/people";

/* ---------- dates ---------- */
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const todayISO = () => iso(new Date());
function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday start
  return d;
}
function weekDates(offset = 0) {
  const s = startOfWeek(new Date()); s.setDate(s.getDate() + offset * 7);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); return iso(d); });
}
function monthDates(offset = 0) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const out = [];
  for (let i = 1; i <= last.getDate(); i++) out.push(iso(new Date(first.getFullYear(), first.getMonth(), i)));
  return out;
}
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const fmtDur = (m) => (m == null ? "—" : `${Math.floor(m / 60)}h ${pad(m % 60)}m`);
const fmtDurLong = (m) => (m == null ? "—" : `${Math.floor(m / 60)}h ${pad(Math.round(m % 60))}m`);
const shortDate = (s) => { const d = parseISO(s); return `${d.getMonth() + 1}/${d.getDate()}`; };

/* ---------- data layer (Supabase) ---------- */
async function loadAll() {
  const shape = Object.fromEntries(PEOPLE.map((p) => [p.id, {}]));
  const { data, error } = await supabase.from("entries").select("person,date,score,minutes");
  if (error || !data) return shape;
  for (const row of data) {
    if (!shape[row.person]) shape[row.person] = {};
    shape[row.person][row.date] = { score: row.score, minutes: row.minutes };
  }
  return shape;
}
async function saveNight(person, date, score, minutes) {
  return supabase.from("entries").upsert(
    { person, date, score, minutes, updated_at: new Date().toISOString() },
    { onConflict: "person,date" }
  );
}

/* ---------- stats ---------- */
function statsFor(data, dates) {
  return PEOPLE.map((p) => {
    const rows = dates.map((d) => ({ date: d, ...(data[p.id]?.[d] || {}) })).filter((r) => typeof r.score === "number");
    const scores = rows.map((r) => r.score);
    const mins = rows.map((r) => r.minutes).filter((m) => typeof m === "number");
    return {
      ...p, nights: rows.length, rows,
      avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      bestRow: rows.length ? rows.reduce((a, b) => (b.score > a.score ? b : a)) : null,
      worstRow: rows.length ? rows.reduce((a, b) => (b.score < a.score ? b : a)) : null,
      totalMin: mins.reduce((a, b) => a + b, 0),
      avgMin: mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null,
    };
  });
}

/* ---------- pieces ---------- */
function Board({ title, note, rows, empty }) {
  return (
    <section className="board">
      <header className="board-head"><h3>{title}</h3>{note && <span className="board-note">{note}</span>}</header>
      {rows.length === 0 ? <p className="empty">{empty}</p> : (
        <ol className="rank">
          {rows.map((r, i) => (
            <li key={r.id} className={i === 0 ? "rank-row lead" : "rank-row"}>
              <span className="rank-n">{i + 1}</span>
              <span className="dot" style={{ background: r.color }} />
              <span className="rank-name">{r.name}</span>
              <span className="rank-sub">{r.sub}</span>
              <span className="rank-val" style={{ color: i === 0 ? r.color : undefined }}>{r.value}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function NightStrip({ stats, dates, labels }) {
  const ranked = [...stats].sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
  return (
    <div className="strip-wrap">
      <div className="strip-days">
        <span className="strip-namecol" />
        {labels.map((l, i) => <span key={i} className="strip-day">{l}</span>)}
        <span className="strip-avgcol">avg</span>
      </div>
      {ranked.map((p) => (
        <div className="strip-row" key={p.id}>
          <span className="strip-name"><span className="dot" style={{ background: p.color }} />{p.name}</span>
          {dates.map((d) => {
            const e = p.rows.find((r) => r.date === d);
            const h = e ? Math.max(6, ((e.score - 40) / 60) * 100) : 0;
            return (
              <span className="cell" key={d} title={e ? `${p.name} · ${shortDate(d)} · ${e.score} · ${fmtDur(e.minutes)}` : `${shortDate(d)} · not logged`}>
                {e ? <span className="bar" style={{ height: `${Math.min(100, h)}%`, background: p.color }}><span className="bar-num">{e.score}</span></span>
                   : <span className="bar-miss" />}
              </span>
            );
          })}
          <span className="strip-avg" style={{ color: p.color }}>{p.avg == null ? "—" : p.avg.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- app ---------- */
export default function NightShift() {
  const [data, setData] = useState(Object.fromEntries(PEOPLE.map((p) => [p.id, {}])));
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [pending, setPending] = useState([]);
  const [reading, setReading] = useState(false);
  const [manual, setManual] = useState({ date: todayISO(), score: "", h: "", m: "" });
  const fileRef = useRef(null);

  const refresh = async () => setData(await loadAll());

  useEffect(() => {
    try { const saved = localStorage.getItem("nightshift_me"); if (saved && byId[saved]) setMe(saved); } catch {}
    (async () => { await refresh(); setLoading(false); })();
    // live updates when anyone logs a night
    const channel = supabase
      .channel("entries-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const pickMe = (id) => { setMe(id); try { localStorage.setItem("nightshift_me", id); } catch {} };

  const wDates = useMemo(() => weekDates(weekOffset), [weekOffset]);
  const mDates = useMemo(() => monthDates(monthOffset), [monthOffset]);
  const wStats = useMemo(() => statsFor(data, wDates), [data, wDates]);
  const mStats = useMemo(() => statsFor(data, mDates), [data, mDates]);

  const weekLabel = `${shortDate(wDates[0])} – ${shortDate(wDates[6])}`;
  const monthRef = new Date(new Date().getFullYear(), new Date().getMonth() + monthOffset, 1);
  const monthLabel = `${MONTH_NAMES[monthRef.getMonth()]} ${monthRef.getFullYear()}`;

  const bestNight = wStats.filter((p) => p.bestRow).sort((a, b) => b.bestRow.score - a.bestRow.score);
  const worstNight = wStats.filter((p) => p.worstRow).sort((a, b) => a.worstRow.score - b.worstRow.score);
  const weekAvg = wStats.filter((p) => p.avg != null).sort((a, b) => b.avg - a.avg);
  const monthAvg = mStats.filter((p) => p.avg != null).sort((a, b) => b.avg - a.avg);
  const monthDur = mStats.filter((p) => p.totalMin > 0).sort((a, b) => b.totalMin - a.totalMin);

  const trend = wDates.map((d, i) => {
    const row = { label: DOW[i] };
    PEOPLE.forEach((p) => { row[p.id] = data[p.id]?.[d]?.score ?? null; });
    return row;
  });
  const durChart = monthDur.map((p) => ({ name: p.name, hours: +(p.totalMin / 60).toFixed(1), color: p.color }));

  const commit = async (rows) => {
    if (!me) return;
    setSaving(true);
    try {
      for (const r of rows) {
        const { error } = await saveNight(me, r.date, r.score, r.minutes);
        if (error) throw error;
      }
      await refresh();
      setStatus(`Logged ${rows.length} night${rows.length > 1 ? "s" : ""} for ${byId[me].name}.`);
    } catch {
      setStatus("That didn't save. Check your connection and try again.");
    }
    setSaving(false);
  };

  const fileToBase64 = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("read failed"));
    r.readAsDataURL(file);
  });

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setReading(true); setStatus(null);
    const out = [];
    for (const f of files) {
      try {
        const image = await fileToBase64(f);
        const media = f.type === "image/png" ? "image/png" : f.type === "image/webp" ? "image/webp" : "image/jpeg";
        const resp = await fetch("/api/read-screenshot", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ image, media_type: media }),
        });
        if (!resp.ok) throw new Error();
        const r = await resp.json();
        out.push({ id: Math.random().toString(36).slice(2), date: todayISO(),
          score: r.score ?? "", h: r.minutes != null ? Math.floor(r.minutes / 60) : "",
          m: r.minutes != null ? r.minutes % 60 : "", file: f.name });
      } catch {
        out.push({ id: Math.random().toString(36).slice(2), date: todayISO(), score: "", h: "", m: "", file: f.name, failed: true });
      }
    }
    setPending((p) => [...p, ...out]);
    setReading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const savePending = async () => {
    const rows = pending.filter((p) => p.score !== "" && p.score != null)
      .map((p) => ({ date: p.date, score: Math.round(Number(p.score)),
        minutes: p.h === "" && p.m === "" ? null : (Number(p.h) || 0) * 60 + (Number(p.m) || 0) }));
    if (!rows.length) { setStatus("Add a score before saving."); return; }
    await commit(rows); setPending([]);
  };

  const saveManual = async () => {
    if (manual.score === "") { setStatus("Add a score before saving."); return; }
    await commit([{ date: manual.date, score: Math.round(Number(manual.score)),
      minutes: manual.h === "" && manual.m === "" ? null : (Number(manual.h) || 0) * 60 + (Number(manual.m) || 0) }]);
    setManual({ date: todayISO(), score: "", h: "", m: "" });
  };

  const myWeek = wStats.find((p) => p.id === me);
  const loggedToday = me && data[me]?.[todayISO()];

  return (
    <div className="ns">
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap');
.ns { --bg:#080B14; --panel:#101728; --panel2:#0C1120; --line:#1E2740; --ink:#E9EDF7; --dim:#7C89A8; --dimmer:#4A5673;
  background:var(--bg); color:var(--ink); min-height:100vh; padding:20px 16px 64px;
  font-family:'Inter',system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
.ns * { box-sizing:border-box; }
.wrap { max-width:1100px; margin:0 auto; }
.masthead { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; flex-wrap:wrap;
  padding-bottom:16px; border-bottom:1px solid var(--line); margin-bottom:24px; }
.title { font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:clamp(30px,7vw,46px);
  line-height:0.92; letter-spacing:-0.03em; margin:0; }
.title em { font-style:normal; color:var(--dimmer); }
.tagline { color:var(--dim); font-size:13px; margin:8px 0 0; max-width:42ch; }
.whoami { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
.whoami-label { font-size:10px; letter-spacing:0.16em; text-transform:uppercase; color:var(--dimmer); }
.chips { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
.chip { border:1px solid var(--line); background:transparent; color:var(--dim); border-radius:999px;
  padding:6px 12px; font-size:12px; font-weight:500; cursor:pointer; transition:all .15s; font-family:inherit; }
.chip:hover { border-color:var(--dim); color:var(--ink); }
.periodbar { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
.periodbar h2 { font-family:'Bricolage Grotesque',sans-serif; font-size:15px; font-weight:700; margin:0; letter-spacing:0.02em; }
.periodbar .sub { color:var(--dimmer); font-size:12px; }
.nav { margin-left:auto; display:flex; gap:4px; }
.nav button { background:var(--panel); border:1px solid var(--line); color:var(--dim); width:28px; height:28px;
  border-radius:7px; cursor:pointer; font-size:13px; font-family:inherit; }
.nav button:hover:not(:disabled) { color:var(--ink); border-color:var(--dim); }
.nav button:disabled { opacity:.3; cursor:default; }
.panel { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:18px; }
.strip-wrap { overflow-x:auto; }
.strip-days, .strip-row { display:grid; grid-template-columns:88px repeat(7,minmax(30px,1fr)) 48px; gap:5px; align-items:end; min-width:560px; }
.strip-days { padding-bottom:8px; }
.strip-day, .strip-avgcol { font-size:10px; letter-spacing:0.1em; text-transform:uppercase; color:var(--dimmer); text-align:center; }
.strip-avgcol { text-align:right; }
.strip-row { height:74px; margin-bottom:5px; }
.strip-name { font-size:13px; font-weight:500; display:flex; align-items:center; gap:7px; padding-bottom:2px; white-space:nowrap; }
.dot { width:8px; height:8px; border-radius:50%; flex:none; }
.cell { height:100%; background:var(--panel2); border-radius:5px; display:flex; align-items:flex-end; justify-content:center; overflow:hidden; }
.bar { width:100%; border-radius:5px; display:flex; align-items:flex-start; justify-content:center; padding-top:3px; animation:rise .5s cubic-bezier(.2,.8,.2,1) both; }
.bar-num { font-family:'JetBrains Mono',monospace; font-size:10px; font-weight:600; color:#080B14; }
.bar-miss { width:100%; height:3px; background:var(--line); border-radius:3px; }
@keyframes rise { from { height:0; } }
@media (prefers-reduced-motion:reduce) { .bar { animation:none; } }
.strip-avg { font-family:'JetBrains Mono',monospace; font-size:14px; font-weight:600; text-align:right; padding-bottom:2px; }
.logbox { margin:28px 0; background:var(--panel); border:1px solid var(--line); border-radius:14px; overflow:hidden; }
.logbox-head { padding:14px 18px; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.logbox-head h2 { font-family:'Bricolage Grotesque',sans-serif; font-size:15px; margin:0; font-weight:700; }
.streakflag { font-size:11px; padding:3px 9px; border-radius:999px; background:var(--panel2); color:var(--dim); }
.logbox-body { padding:18px; display:grid; gap:18px; grid-template-columns:1fr 1fr; }
@media (max-width:720px) { .logbox-body { grid-template-columns:1fr; } }
.field { display:flex; flex-direction:column; gap:5px; }
.field label { font-size:10px; letter-spacing:0.14em; text-transform:uppercase; color:var(--dimmer); }
input[type=number], input[type=date] { background:var(--panel2); border:1px solid var(--line); color:var(--ink);
  border-radius:8px; padding:9px 10px; font-size:14px; font-family:'JetBrains Mono',monospace; width:100%; }
input:focus-visible, button:focus-visible, .drop:focus-visible { outline:2px solid #4FC3F7; outline-offset:2px; }
.row3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
.btn { background:var(--ink); color:#080B14; border:none; border-radius:8px; padding:10px 16px; font-weight:600; font-size:13px; cursor:pointer; font-family:inherit; }
.btn:disabled { opacity:.4; cursor:default; }
.btn-ghost { background:transparent; border:1px solid var(--line); color:var(--dim); }
.drop { border:1px dashed var(--line); border-radius:10px; padding:22px 16px; text-align:center; color:var(--dim); cursor:pointer; font-size:13px; display:block; }
.drop:hover { border-color:var(--dim); color:var(--ink); }
.drop strong { display:block; color:var(--ink); font-size:14px; margin-bottom:4px; font-weight:600; }
.hint { font-size:11px; color:var(--dimmer); line-height:1.5; }
.status { font-size:12px; color:var(--dim); padding:0 18px 16px; }
.pendrow { display:grid; grid-template-columns:1.1fr .7fr .6fr .6fr auto; gap:8px; align-items:end; padding:12px 0; border-top:1px solid var(--line); }
@media (max-width:720px) { .pendrow { grid-template-columns:1fr 1fr; } }
.pendfile { grid-column:1/-1; font-size:11px; color:var(--dimmer); }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px; margin-top:14px; }
.board { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px; }
.board-head { display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin-bottom:12px; }
.board-head h3 { font-family:'Bricolage Grotesque',sans-serif; font-size:13px; margin:0; font-weight:700; }
.board-note { font-size:10px; color:var(--dimmer); text-transform:uppercase; letter-spacing:0.1em; }
.rank { list-style:none; margin:0; padding:0; }
.rank-row { display:grid; grid-template-columns:16px 8px 1fr auto auto; gap:9px; align-items:center; padding:7px 0; border-bottom:1px solid rgba(255,255,255,.04); font-size:13px; }
.rank-row:last-child { border-bottom:none; }
.rank-n { font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--dimmer); }
.lead .rank-n { color:var(--ink); }
.rank-name { font-weight:500; }
.lead .rank-name { font-weight:600; }
.rank-sub { font-size:11px; color:var(--dimmer); font-family:'JetBrains Mono',monospace; }
.rank-val { font-family:'JetBrains Mono',monospace; font-weight:600; font-size:14px; }
.empty { font-size:12px; color:var(--dimmer); margin:0; padding:8px 0; }
.charts { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:14px; }
@media (max-width:820px) { .charts { grid-template-columns:1fr; } }
.chart-title { font-family:'Bricolage Grotesque',sans-serif; font-size:13px; font-weight:700; margin:0 0 2px; }
.chart-sub { font-size:11px; color:var(--dimmer); margin:0 0 14px; }
.legend { display:flex; flex-wrap:wrap; gap:10px; margin-top:10px; }
.legend span { font-size:11px; color:var(--dim); display:flex; align-items:center; gap:5px; }
.section-label { font-size:10px; letter-spacing:0.18em; text-transform:uppercase; color:var(--dimmer); margin:34px 0 0; }
.tip { background:var(--panel2); border:1px solid var(--line); border-radius:12px; padding:14px 16px; font-size:12px; color:var(--dim); line-height:1.6; margin-top:14px; }
      `}</style>

      <div className="wrap">
        <div className="masthead">
          <div>
            <h1 className="title">THE NIGHT<br /><em>SHIFT</em></h1>
            <p className="tagline">Seven of us. One score a night. Post your Garmin screenshot before the day gets away from you.</p>
          </div>
          <div className="whoami">
            <span className="whoami-label">Logging as</span>
            <div className="chips">
              {PEOPLE.map((p) => (
                <button key={p.id} className="chip" style={me === p.id ? { background: p.color, borderColor: p.color, color: "#080B14", fontWeight: 600 } : {}} onClick={() => pickMe(p.id)}>{p.name}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="periodbar">
          <h2>The week</h2>
          <span className="sub">{weekLabel} · Mon–Sun</span>
          <div className="nav">
            <button onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week">‹</button>
            <button onClick={() => setWeekOffset((w) => Math.min(0, w + 1))} disabled={weekOffset >= 0} aria-label="Next week">›</button>
          </div>
        </div>
        <div className="panel">
          {loading ? <p className="empty">Pulling everyone's nights…</p> : <NightStrip stats={wStats} dates={wDates} labels={DOW} />}
        </div>

        <div className="logbox">
          <div className="logbox-head">
            <h2>Log a night</h2>
            {me ? (
              <span className="streakflag">{loggedToday ? `${byId[me].name} — today is in` : `${byId[me].name} — today is still blank`}{myWeek ? ` · ${myWeek.nights}/7 this week` : ""}</span>
            ) : <span className="streakflag">Pick your name above first</span>}
          </div>
          <div className="logbox-body">
            <div className="field">
              <label>From a screenshot</label>
              <label className="drop" tabIndex={0}>
                <strong>{reading ? "Reading…" : "Add Garmin screenshots"}</strong>
                {reading ? "One moment" : "Select one or more — you can catch up on missed days"}
                <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFiles} disabled={!me || reading} style={{ display: "none" }} />
              </label>
              <p className="hint">The score and duration get read off the image. Check them before saving — it misreads occasionally.</p>
            </div>
            <div className="field">
              <label>Or type it in</label>
              <div className="row3">
                <div className="field"><label>Score</label><input type="number" min="0" max="100" value={manual.score} onChange={(e) => setManual({ ...manual, score: e.target.value })} placeholder="82" /></div>
                <div className="field"><label>Hours</label><input type="number" min="0" max="16" value={manual.h} onChange={(e) => setManual({ ...manual, h: e.target.value })} placeholder="7" /></div>
                <div className="field"><label>Minutes</label><input type="number" min="0" max="59" value={manual.m} onChange={(e) => setManual({ ...manual, m: e.target.value })} placeholder="10" /></div>
              </div>
              <div className="field" style={{ marginTop: 10 }}><label>Morning of</label><input type="date" value={manual.date} max={todayISO()} onChange={(e) => setManual({ ...manual, date: e.target.value })} /></div>
              <button className="btn" style={{ marginTop: 12 }} onClick={saveManual} disabled={!me || saving}>{saving ? "Saving…" : "Save night"}</button>
            </div>
          </div>

          {pending.length > 0 && (
            <div style={{ padding: "0 18px 18px" }}>
              <p className="hint" style={{ marginBottom: 4 }}>Confirm what came off the screenshots, then save.</p>
              {pending.map((p, i) => (
                <div className="pendrow" key={p.id}>
                  <span className="pendfile">{p.file}{p.failed ? " — couldn't read this one, enter it by hand" : ""}</span>
                  <div className="field"><label>Morning of</label><input type="date" value={p.date} max={todayISO()} onChange={(e) => setPending(pending.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} /></div>
                  <div className="field"><label>Score</label><input type="number" value={p.score} onChange={(e) => setPending(pending.map((x, j) => (j === i ? { ...x, score: e.target.value } : x)))} /></div>
                  <div className="field"><label>Hrs</label><input type="number" value={p.h} onChange={(e) => setPending(pending.map((x, j) => (j === i ? { ...x, h: e.target.value } : x)))} /></div>
                  <div className="field"><label>Min</label><input type="number" value={p.m} onChange={(e) => setPending(pending.map((x, j) => (j === i ? { ...x, m: e.target.value } : x)))} /></div>
                  <button className="btn btn-ghost" onClick={() => setPending(pending.filter((_, j) => j !== i))}>Drop</button>
                </div>
              ))}
              <button className="btn" style={{ marginTop: 12 }} onClick={savePending} disabled={saving}>{saving ? "Saving…" : `Save ${pending.length} night${pending.length > 1 ? "s" : ""}`}</button>
            </div>
          )}
          {status && <p className="status">{status}</p>}
        </div>

        <p className="section-label">This week · {weekLabel}</p>
        <div className="grid">
          <Board title="Best night" note="single score" empty="Nothing logged this week yet."
            rows={bestNight.map((p) => ({ id: p.id, name: p.name, color: p.color, sub: shortDate(p.bestRow.date), value: p.bestRow.score }))} />
          <Board title="Roughest night" note="single score" empty="Nothing logged this week yet."
            rows={worstNight.map((p) => ({ id: p.id, name: p.name, color: p.color, sub: shortDate(p.worstRow.date), value: p.worstRow.score }))} />
          <Board title="Weekly average" note="top 5" empty="Nothing logged this week yet."
            rows={weekAvg.slice(0, 5).map((p) => ({ id: p.id, name: p.name, color: p.color, sub: `${p.nights} nt`, value: p.avg.toFixed(1) }))} />
        </div>

        <div className="periodbar" style={{ marginTop: 34 }}>
          <h2>The month</h2>
          <span className="sub">{monthLabel} · resets on the 1st</span>
          <div className="nav">
            <button onClick={() => setMonthOffset((m) => m - 1)} aria-label="Previous month">‹</button>
            <button onClick={() => setMonthOffset((m) => Math.min(0, m + 1))} disabled={monthOffset >= 0} aria-label="Next month">›</button>
          </div>
        </div>
        <div className="grid" style={{ marginTop: 0 }}>
          <Board title="Monthly average" note="standings" empty={`Nothing logged in ${monthLabel} yet.`}
            rows={monthAvg.slice(0, 10).map((p) => ({ id: p.id, name: p.name, color: p.color, sub: `${p.nights} nt`, value: p.avg.toFixed(1) }))} />
          <Board title="Most sleep banked" note="month total" empty={`Nothing logged in ${monthLabel} yet.`}
            rows={monthDur.map((p) => ({ id: p.id, name: p.name, color: p.color, sub: `${fmtDurLong(Math.round(p.avgMin))}/nt`, value: `${(p.totalMin / 60).toFixed(1)}h` }))} />
          <Board title="Nights on record" note="month · accountability" empty={`Nothing logged in ${monthLabel} yet.`}
            rows={[...mStats].sort((a, b) => b.nights - a.nights).map((p) => ({ id: p.id, name: p.name, color: p.color, sub: `of ${mDates.filter((d) => d <= todayISO()).length}`, value: p.nights }))} />
        </div>

        <p className="section-label">Trends</p>
        <div className="charts">
          <div className="panel">
            <h3 className="chart-title">Score, night by night</h3>
            <p className="chart-sub">{weekLabel}</p>
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={trend} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid stroke="#1E2740" vertical={false} />
                <XAxis dataKey="label" stroke="#4A5673" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis domain={[40, 100]} stroke="#4A5673" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#101728", border: "1px solid #1E2740", borderRadius: 10, fontSize: 12 }} labelStyle={{ color: "#7C89A8" }} />
                {PEOPLE.map((p) => <Line key={p.id} type="monotone" dataKey={p.id} name={p.name} stroke={p.color} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />)}
              </LineChart>
            </ResponsiveContainer>
            <div className="legend">{PEOPLE.map((p) => <span key={p.id}><i className="dot" style={{ background: p.color, width: 8, height: 8, borderRadius: 9, display: "inline-block" }} />{p.name}</span>)}</div>
          </div>
          <div className="panel">
            <h3 className="chart-title">Hours banked</h3>
            <p className="chart-sub">{monthLabel} total</p>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={durChart} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid stroke="#1E2740" vertical={false} />
                <XAxis dataKey="name" stroke="#4A5673" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis stroke="#4A5673" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "#0C1120" }} contentStyle={{ background: "#101728", border: "1px solid #1E2740", borderRadius: 10, fontSize: 12 }} />
                <Bar dataKey="hours" name="hours" radius={[5, 5, 0, 0]}>{durChart.map((d) => <Cell key={d.name} fill={d.color} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="hint" style={{ marginTop: 10 }}>Duration is a volume stat, not a quality one — a 10-hour night with a 60 score still counts here.</p>
          </div>
        </div>

        <div className="tip">House rules worth agreeing on up front: log the morning you wake up, use the Garmin number as-is, and don't backfill more than three days. Averages only mean something if everyone's posting roughly the same number of nights — the "nights on record" board is there to keep that honest.</div>
      </div>
    </div>
  );
}
