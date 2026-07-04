import { useState, useRef, useEffect, useCallback } from "react";
import { loadLocal, saveLocal } from "./lib/storage";
import { todayStr, addDays, mondayOf, weekDates, dowIdx, maxMonday, fmtMD, fmtShort, EPOCH_MONDAY } from "./lib/dates";
import { canPlace, canSmash } from "./lib/rules";

/* ============================================================
   方块时间 DaysCraft — 周视图为默认的"家庭规划表"
   结构：7 天 × 4 时段（上午/下午/晚上/黑夜）
   周视图 = 和爸妈一起规划（拖方块进格子、换时间）
   日视图 = 孩子执行（长按敲碎）
   黑夜 = 睡觉禁区，有怪物出没，不能放方块
   ============================================================ */

/* ---------- 像素纹理 ---------- */
function lcg(seed) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
function makeTexture(type) {
  const rnd = lcg(type === "stone" ? 7 : type === "grass" ? 42 : 99);
  const cells = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      let c;
      if (type === "stone") {
        const p = ["#9a9a9a", "#8b8b8b", "#7d7d7d", "#a6a6a6", "#909090"];
        c = p[Math.floor(rnd() * p.length)];
      } else if (type === "grass") {
        if (y < 2) { const p = ["#5fae3c", "#6dbb45", "#4f9a30", "#79c653"]; c = p[Math.floor(rnd() * p.length)]; }
        else if (y === 2) { c = rnd() > 0.5 ? "#5fae3c" : "#8a5a32"; }
        else { const p = ["#8a5a32", "#79492a", "#93643c", "#815234"]; c = p[Math.floor(rnd() * p.length)]; }
      } else {
        const stripes = ["#9c6b30", "#8a5a28", "#a87938", "#7b4e22"];
        c = stripes[x % 4];
        if (rnd() > 0.82) c = "#6f451e";
      }
      cells.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" shape-rendering="crispEdges">${cells.join("")}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
const TEX = { stone: makeTexture("stone"), grass: makeTexture("grass"), wood: makeTexture("wood") };
const TEX_COLORS = {
  stone: ["#9a9a9a", "#7d7d7d", "#a6a6a6"],
  grass: ["#5fae3c", "#8a5a32", "#6dbb45"],
  wood: ["#9c6b30", "#7b4e22", "#a87938"],
};
const TEX_NAMES = { stone: "学习·石头", grass: "玩耍·草块", wood: "家务·木头" };

/* ---------- 常量 ---------- */
const PRESETS = [
  { pid: "hw", icon: "✏️", label: "写作业", tex: "stone" },
  { pid: "read", icon: "📖", label: "读书", tex: "stone" },
  { pid: "piano", icon: "🎹", label: "练琴", tex: "stone" },
  { pid: "sport", icon: "⚽", label: "运动", tex: "grass" },
  { pid: "draw", icon: "🎨", label: "画画", tex: "grass" },
  { pid: "tv", icon: "📺", label: "看动画", tex: "grass" },
  { pid: "fish", icon: "🐟", label: "喂鱼", tex: "wood" },
  { pid: "toys", icon: "🧸", label: "收玩具", tex: "wood" },
];
const ICON_LIB = ["🧮","📚","🖍️","🔤","🧪","🎻","🥁","🏊","🚴","🧗","🏀","⚽","🎮","🧩","🪁","🎬","🎧","🦖","🪥","🛁","🧹","🍽️","🌱","🐕","🛏️","🥛","🍎","🧊"];
const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const BANDS = [
  { key: "morning", name: "上午", icon: "☀️", sky: "rgba(255,236,150,0.28)" },
  { key: "afternoon", name: "下午", icon: "🌤️", sky: "rgba(255,200,120,0.22)" },
  { key: "evening", name: "晚上", icon: "🌆", sky: "rgba(140,120,200,0.25)" },
  { key: "night", name: "黑夜", icon: "🧟", sky: "rgba(20,20,45,0.55)", sleep: true },
];
const CAP = 3; // 每个时段最多 3 块
const MONSTERS = ["🧟", "🕷️", "💀", "👾"];

/* ---------- 音效 ---------- */
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}
function noiseBurst(dur, freq, gain) {
  if (!audioCtx) return;
  const n = audioCtx.sampleRate * dur;
  const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const bp = audioCtx.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.value = freq;
  const g = audioCtx.createGain(); g.gain.value = gain;
  src.connect(bp).connect(g).connect(audioCtx.destination);
  src.start();
}
const sndDig = () => noiseBurst(0.07, 900, 0.25);
const sndBreak = () => { noiseBurst(0.22, 500, 0.5); noiseBurst(0.15, 1800, 0.3); };
const sndPlace = () => noiseBurst(0.05, 300, 0.3);
function sndPop() {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
  o.type = "square";
  o.frequency.setValueAtTime(500, audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(1100, audioCtx.currentTime + 0.09);
  g.gain.setValueAtTime(0.12, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
  o.connect(g).connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + 0.13);
}
function sndGrowl() { noiseBurst(0.3, 160, 0.35); }

/* ---------- 裂纹 ---------- */
function Cracks({ stage }) {
  if (stage <= 0) return null;
  const lines = [
    ["M32 32 L18 14", "M32 32 L48 20", "M32 32 L40 50"],
    ["M32 32 L12 34", "M32 32 L52 44", "M18 14 L10 8", "M48 20 L56 12"],
    ["M32 32 L24 56", "M12 34 L4 30", "M40 50 L46 60", "M52 44 L60 50", "M32 32 L30 6"],
  ];
  const show = lines.slice(0, stage).flat();
  return (
    <svg viewBox="0 0 64 64" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      {show.map((d, i) => (
        <path key={i} d={d} stroke="rgba(20,15,10,0.75)" strokeWidth="2.4" fill="none" strokeLinecap="square" />
      ))}
    </svg>
  );
}

const emptyDay = () => ({ morning: [], afternoon: [], evening: [] });
let uidSeq = 0;
const uid = () => "b" + Date.now().toString(36) + (uidSeq++).toString(36);

/* ============================================================ */
export default function App() {
  const today = todayStr();
  const thisMonday = mondayOf(today);
  const [saved] = useState(loadLocal);
  const [days, setDays] = useState(() => {
    if (saved?.days) return saved.days;
    // 全新用户：给今天放两个演示方块
    return { [today]: {
      morning: [{ id: uid(), ...PRESETS[1] }],
      afternoon: [{ id: uid(), ...PRESETS[3] }],
      evening: [],
    } };
  });
  const [view, setView] = useState("week"); // 默认周视图
  const [anchorMonday, setAnchorMonday] = useState(thisMonday); // 周视图当前显示的周
  const [dayDate, setDayDate] = useState(today); // 日视图当前显示的天
  const [customs, setCustoms] = useState(() => saved?.customs ?? []);
  const [showEditor, setShowEditor] = useState(false);
  const [materials, setMaterials] = useState(() => saved?.materials ?? { stone: 0, grass: 0, wood: 0 });
  const [totalEver, setTotalEver] = useState(() => saved?.totalEver ?? 0);
  const [particles, setParticles] = useState([]);
  const [flyers, setFlyers] = useState([]);
  const [toast, setToast] = useState(null);
  const [showWorld, setShowWorld] = useState(false);
  const [worldNew, setWorldNew] = useState(false);
  const [drag, setDrag] = useState(null); // {block, src, x, y, hover}
  const [charge, setCharge] = useState(null);
  const [detail, setDetail] = useState(null); // {block, src} 周视图点击方块的详情弹窗

  const gesture = useRef(null);
  const boxRef = useRef(null);
  const hudRef = useRef({});
  const toastTimer = useRef(null);
  const viewRef = useRef(view); viewRef.current = view;
  const dayDateRef = useRef(dayDate); dayDateRef.current = dayDate;
  const daysRef = useRef(days); daysRef.current = days;

  const allBlocks = [...PRESETS, ...customs];
  const dayOf = (date) => days[date] ?? emptyDay();
  const setDay = (date, updater) => setDays((ds) => ({ ...ds, [date]: updater(ds[date] ?? emptyDay()) }));

  /* ---- 本地存档 ---- */
  useEffect(() => {
    saveLocal({ version: 2, days, customs, materials, totalEver, updatedAt: Date.now() });
  }, [days, customs, materials, totalEver]);

  const showToast = useCallback((msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const stageOf = (n) => (n >= 12 ? 5 : n >= 8 ? 4 : n >= 5 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0);
  const worldStage = stageOf(totalEver);
  const nextNeed = [1, 3, 5, 8, 12][worldStage] ?? null;

  /* ---- 放置 / 移动 ---- */
  const placeBlock = useCallback((src, block, dDate, dBand) => {
    setDays((ds) => {
      const get = (date) => ds[date] ?? emptyDay();
      if (src.kind === "cell" && src.date === dDate && src.band === dBand) return ds; // 原地不动
      if (get(dDate)[dBand].length >= CAP) {
        showToast(`${DAY_NAMES[dowIdx(dDate)]}${BANDS.find((b) => b.key === dBand).name}满啦！`);
        return ds;
      }
      const nds = { ...ds };
      if (src.kind === "cell") {
        nds[src.date] = { ...get(src.date), [src.band]: get(src.date)[src.band].filter((b) => b.id !== block.id) };
      }
      const base = nds[dDate] ?? emptyDay();
      const inst = src.kind === "box"
        ? { id: uid(), icon: block.icon, label: block.label, tex: block.tex }
        : block;
      nds[dDate] = { ...base, [dBand]: [...base[dBand], inst] };
      sndPlace();
      return nds;
    });
  }, [showToast]);

  const removeBlock = useCallback((src, block) => {
    if (src.kind !== "cell") return;
    setDay(src.date, (d) => ({ ...d, [src.band]: d[src.band].filter((b) => b.id !== block.id) }));
    showToast("方块回百宝箱啦");
  }, [showToast]);

  /* ---- 敲碎 ---- */
  const smash = useCallback((src, block) => {
    const el = document.getElementById("blk-" + block.id);
    const rect = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 64, height: 64 };
    sndBreak();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const cols = TEX_COLORS[block.tex];
    const ps = Array.from({ length: 14 }, (_, i) => ({
      key: "p" + Date.now() + i, x: cx, y: cy,
      dx: (Math.random() - 0.5) * 180, dy: -Math.random() * 140 - 30,
      rot: (Math.random() - 0.5) * 540, size: 6 + Math.random() * 8,
      color: cols[i % cols.length],
    }));
    setParticles((p) => [...p, ...ps]);
    setTimeout(() => setParticles((p) => p.filter((q) => !ps.includes(q))), 900);
    const target = hudRef.current[block.tex]?.getBoundingClientRect();
    if (target) {
      const f = { key: "f" + Date.now(), tex: block.tex, x0: cx, y0: cy, x1: target.left + target.width / 2, y1: target.top + target.height / 2 };
      setFlyers((fl) => [...fl, f]);
      setTimeout(() => {
        setFlyers((fl) => fl.filter((q) => q.key !== f.key));
        sndPop();
        setMaterials((m) => ({ ...m, [block.tex]: m[block.tex] + 1 }));
        setTotalEver((t) => {
          const nt = t + 1;
          if (stageOf(nt) > stageOf(t)) { setWorldNew(true); showToast("🏠 你的小世界长大了！"); }
          return nt;
        });
      }, 620);
    }
    setDay(src.date, (d) => ({
      ...d,
      [src.band]: d[src.band].map((b) => b.id === block.id ? { ...b, done: true, doneAt: Date.now() } : b),
    }));
  }, [showToast]);

  /* ---- 命中检测 ---- */
  const inRect = (r, x, y) => r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  const findCellAt = (x, y) => {
    const cells = document.querySelectorAll("[data-cell]");
    for (const el of cells) {
      if (inRect(el.getBoundingClientRect(), x, y)) {
        const [date, band] = el.getAttribute("data-cell").split("|");
        return { date, band };
      }
    }
    return null;
  };

  /* ---- 手势 ---- */
  const onBlockDown = (e, block, src) => {
    if (e.button != null && e.button !== 0) return;
    ensureAudio();
    e.preventDefault();
    const g = { block, src, x0: e.clientX, y0: e.clientY, mode: "pending", chargeTimer: null, chargeStart: 0 };
    gesture.current = g;
    // 长按敲碎：仅日视图内、已放置的方块
    if (src.kind === "cell" && viewRef.current === "day") {
      g.chargeStart = performance.now();
      g.chargeTimer = setInterval(() => {
        const el = performance.now() - g.chargeStart;
        const st = Math.min(3, Math.floor(el / 250) + 1);
        setCharge((c) => { if (!c || c.stage !== st) sndDig(); return { id: block.id, stage: st }; });
        if (el >= 760) {
          clearInterval(g.chargeTimer);
          gesture.current = null;
          setCharge(null);
          smash(src, block);
          cleanup();
        }
      }, 60);
    }
    const move = (ev) => {
      const gg = gesture.current;
      if (!gg) return;
      if (gg.mode === "pending" && Math.hypot(ev.clientX - gg.x0, ev.clientY - gg.y0) > 8) {
        if (gg.chargeTimer) { clearInterval(gg.chargeTimer); gg.chargeTimer = null; setCharge(null); }
        gg.mode = "drag";
      }
      if (gg.mode === "drag") {
        setDrag({ block: gg.block, src: gg.src, x: ev.clientX, y: ev.clientY, hover: findCellAt(ev.clientX, ev.clientY) });
      }
    };
    const up = (ev) => {
      const gg = gesture.current;
      if (gg) {
        if (gg.chargeTimer) { clearInterval(gg.chargeTimer); setCharge(null); }
        if (gg.mode === "pending" && gg.src.kind === "box") {
          // 点按百宝箱方块
          if (viewRef.current === "day") {
            const date = dayDateRef.current;
            const d = daysRef.current[date] ?? emptyDay();
            const band = ["morning", "afternoon", "evening"].find((k) => d[k].length < CAP);
            if (band) {
              placeBlock({ kind: "box" }, gg.block, date, band);
              showToast(`放到${BANDS.find((b) => b.key === band).name}啦，可以拖动换时间`);
            } else showToast("今天满啦！");
          } else {
            showToast("把方块拖到想放的格子里吧 👆");
          }
        } else if (gg.mode === "pending" && gg.src.kind === "cell" && viewRef.current === "week") {
          // 周视图点按已放置的方块 → 详情弹窗
          setDetail({ block: gg.block, src: gg.src });
        } else if (gg.mode === "drag") {
          const cell = findCellAt(ev.clientX, ev.clientY);
          if (cell) {
            if (cell.band === "night") {
              sndGrowl();
              showToast("🧟 黑夜有怪物出没，这是睡觉时间！");
            } else {
              placeBlock(gg.src, gg.block, cell.date, cell.band);
            }
          } else if (inRect(boxRef.current?.getBoundingClientRect(), ev.clientX, ev.clientY)) {
            removeBlock(gg.src, gg.block);
          }
        }
      }
      gesture.current = null;
      setDrag(null);
      cleanup();
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  /* ---- UI 基件 ---- */
  const bevel = (raised = true) => ({
    border: "4px solid",
    borderColor: raised ? "#ffffff #565656 #565656 #ffffff" : "#565656 #ffffff #ffffff #565656",
  });

  const PixBtn = ({ children, onClick, active, style }) => (
    <button onClick={onClick} style={{
      ...bevel(!active), background: active ? "#ffe66d" : "#C6C6C6",
      padding: "6px 10px", fontSize: 13, fontWeight: 900, cursor: "pointer",
      fontFamily: "inherit", ...style,
    }}>{children}</button>
  );

  const MatCounter = ({ tex }) => (
    <div ref={(el) => (hudRef.current[tex] = el)} style={{
      display: "flex", alignItems: "center", gap: 6, background: "#8B8B8B",
      ...bevel(false), padding: "4px 8px",
    }}>
      <div style={{ width: 22, height: 22, backgroundImage: TEX[tex], backgroundSize: "cover", imageRendering: "pixelated", border: "2px solid #3a3a3a" }} />
      <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 13, color: "#fff", textShadow: "2px 2px 0 #3a3a3a", minWidth: 22 }}>{materials[tex]}</span>
    </div>
  );

  const Block = ({ block, src, size = 68, showLabel = true }) => {
    const charging = charge && charge.id === block.id;
    const dim = drag && drag.src.kind === "cell" && drag.block.id === block.id;
    return (
      <div
        id={"blk-" + block.id}
        onPointerDown={(e) => onBlockDown(e, block, src)}
        style={{
          width: size, height: size, position: "relative", flexShrink: 0,
          backgroundImage: TEX[block.tex], backgroundSize: "cover", imageRendering: "pixelated",
          ...bevel(true),
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "grab", touchAction: "none", userSelect: "none",
          opacity: dim ? 0.25 : 1,
          animation: charging ? "shake 0.12s infinite" : "none",
          boxShadow: "3px 3px 0 rgba(0,0,0,0.35)",
        }}
      >
        <span style={{ fontSize: size * 0.42, filter: "drop-shadow(1px 1px 0 rgba(0,0,0,0.5))", pointerEvents: "none" }}>{block.icon}</span>
        {showLabel && size >= 56 && (
          <span style={{
            position: "absolute", bottom: -20, left: "50%", transform: "translateX(-50%)",
            fontSize: 11, fontWeight: 900, color: "#fff", textShadow: "1px 1px 0 #000",
            whiteSpace: "nowrap", pointerEvents: "none",
          }}>{block.label}</span>
        )}
        {charging && <Cracks stage={charge.stage} />}
      </div>
    );
  };

  const vertical = typeof window !== "undefined" && window.innerWidth < 640;
  const day = dayOf(dayDate);
  const dates = weekDates(anchorMonday);

  return (
    <div style={{
      minHeight: "100vh", fontFamily: "'PingFang SC','Microsoft YaHei',sans-serif",
      background: "linear-gradient(#79b8e8 0%, #a8d8f0 55%, #6dbb45 55.2%, #5fae3c 100%)",
      display: "flex", flexDirection: "column", overflow: "hidden", position: "relative",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        @keyframes shake { 0%{transform:translate(0,0)} 25%{transform:translate(-2px,1px)} 50%{transform:translate(2px,-1px)} 75%{transform:translate(-1px,-2px)} 100%{transform:translate(1px,2px)} }
        @keyframes popIn { from{transform:scale(0.4);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes floaty { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes lurk { 0%,100%{transform:translateX(0)} 50%{transform:translateX(6px)} }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
      `}</style>

      {/* ===== HUD ===== */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#fff", textShadow: "2px 2px 0 #3a3a3a", letterSpacing: 2 }}>
          ⛏️ 方块时间
        </h1>
        <div style={{ flex: 1 }} />
        <MatCounter tex="stone" />
        <MatCounter tex="grass" />
        <MatCounter tex="wood" />
        <PixBtn onClick={() => { ensureAudio(); setShowWorld(true); setWorldNew(false); }} style={{ position: "relative" }}>
          🏠 我的世界
          {worldNew && <span style={{ position: "absolute", top: -6, right: -6, width: 14, height: 14, background: "#e5484d", border: "2px solid #fff" }} />}
        </PixBtn>
      </div>

      {/* ===== 视图切换 ===== */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px 8px", flexWrap: "wrap" }}>
        <PixBtn active={view === "week"} onClick={() => setView("week")}>🗓️ 一周规划</PixBtn>
        <PixBtn active={view === "day"} onClick={() => { setDayDate(today); setView("day"); }}>☀️ 今日</PixBtn>
        {view === "day" && (
          <span style={{ fontWeight: 900, fontSize: 14, color: "#fff", textShadow: "1px 1px 0 #3a3a3a", marginLeft: 6 }}>
            {fmtMD(dayDate)} {DAY_NAMES[dowIdx(dayDate)]}{dayDate === today ? "（今天）" : ""} — 做完一件，按住方块敲碎它！🔨
          </span>
        )}
        {view === "week" && (
          <span style={{ fontWeight: 700, fontSize: 12, color: "#fff", textShadow: "1px 1px 0 #3a3a3a", marginLeft: 6 }}>
            和爸爸妈妈一起，把这周的方块摆进格子 · 拖动可以换时间 · 点日期进入那一天
          </span>
        )}
      </div>

      {/* ===== 周视图（默认）：7 天 × 4 时段 规划表 ===== */}
      {view === "week" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0 14px 14px", minHeight: 0, gap: 10 }}>
          <div style={{ flex: 1, overflowX: "auto", overflowY: "auto", minHeight: 0 }}>
            <div style={{ ...bevel(true), background: "rgba(58,42,26,0.30)", padding: 8, minWidth: vertical ? 760 : "auto" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: `56px repeat(7, minmax(${vertical ? 92 : 106}px, 1fr))`,
              gap: 4,
            }}>
              {/* 表头 */}
              <div />
              {dates.map((date, i) => (
                <button key={date} onClick={() => { setDayDate(date); setView("day"); sndPlace(); }} style={{
                  border: "2px solid rgba(0,0,0,0.25)", background: date === today ? "#ffe66d" : "rgba(255,255,255,0.75)",
                  fontWeight: 900, fontSize: 13, padding: "8px 4px", cursor: "pointer", fontFamily: "inherit",
                  color: "#3a3a3a",
                }}>
                  {date === today ? "☀️ " : ""}{DAY_NAMES[i]}
                </button>
              ))}
              {/* 四个时段行 */}
              {BANDS.map((band) => (
                <FragmentRow key={band.key} band={band} dates={dates} days={days} drag={drag} Block={Block} bevel={bevel} today={today} />
              ))}
            </div>
            </div>
          </div>

          {/* 百宝箱托盘 */}
          <div ref={boxRef} style={{ background: "#C6C6C6", ...bevel(true), padding: "10px 12px", flexShrink: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 13, color: "#3a3a3a", marginBottom: 8 }}>
              🧰 百宝箱 <span style={{ fontWeight: 400, fontSize: 11 }}>拖进上面的格子 · 把格子里的方块拖回来可以移除</span>
            </div>
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4, alignItems: "flex-start" }}>
              {allBlocks.map((p) => (
                <div key={p.pid} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0, minWidth: 60 }}>
                  <Block block={{ ...p, id: "tpl-" + p.pid }} src={{ kind: "box" }} size={56} showLabel={false} />
                  <span style={{ fontSize: 12, fontWeight: 900, color: "#3a3a3a", whiteSpace: "nowrap" }}>{p.label}</span>
                </div>
              ))}
              <button onClick={() => setShowEditor(true)} style={{
                width: 56, height: 56, flexShrink: 0, ...bevel(true), background: "#a8a8a8",
                fontSize: 20, fontWeight: 900, color: "#3a3a3a", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                fontFamily: "inherit",
              }}>＋<span style={{ fontSize: 9 }}>造方块</span></button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 日视图：四个时段横条 ===== */}
      {view === "day" && (
        <div style={{ flex: 1, display: "flex", flexDirection: vertical ? "column-reverse" : "row", gap: 12, padding: "0 14px 14px", minHeight: 0 }}>
          {/* 百宝箱 */}
          <div ref={boxRef} style={{ background: "#C6C6C6", ...bevel(true), padding: 12, width: vertical ? "auto" : 190, flexShrink: 0, overflowY: "auto" }}>
            <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 10, color: "#3a3a3a" }}>
              🧰 百宝箱 <span style={{ fontWeight: 400, fontSize: 11 }}>点一下或拖出去</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: vertical ? "repeat(5,1fr)" : "repeat(2,1fr)", gap: "10px 6px", justifyItems: "center" }}>
              {allBlocks.map((p) => (
                <div key={p.pid} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <Block block={{ ...p, id: "tpl-" + p.pid }} src={{ kind: "box" }} size={60} showLabel={false} />
                  <span style={{ fontSize: 11, fontWeight: 900, color: "#3a3a3a" }}>{p.label}</span>
                </div>
              ))}
              <button onClick={() => setShowEditor(true)} style={{
                width: 60, height: 60, ...bevel(true), background: "#a8a8a8",
                fontSize: 20, fontWeight: 900, color: "#3a3a3a", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                fontFamily: "inherit",
              }}>＋<span style={{ fontSize: 9 }}>造方块</span></button>
            </div>
          </div>

          {/* 时段横条 */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0, overflowY: "auto" }}>
            {BANDS.map((band) => {
              const isNight = band.sleep;
              const blocks = isNight ? [] : day[band.key];
              const hovered = drag && drag.hover && drag.hover.date === dayDate && drag.hover.band === band.key;
              return (
                <div
                  key={band.key}
                  data-cell={`${dayDate}|${band.key}`}
                  style={{
                    flex: isNight ? "0 0 84px" : 1, minHeight: isNight ? 84 : 110,
                    background: band.sky, ...bevel(false),
                    display: "flex", alignItems: "center", gap: 18, padding: "8px 14px",
                    outline: hovered ? (isNight ? "4px dashed #e5484d" : "4px dashed #ffe66d") : "none",
                    outlineOffset: -8, position: "relative",
                  }}
                >
                  <div style={{ width: 58, flexShrink: 0, textAlign: "center" }}>
                    <div style={{ fontSize: 26 }}>{band.icon}</div>
                    <div style={{ fontWeight: 900, fontSize: 13, color: "#fff", textShadow: "1px 1px 0 #3a3a3a" }}>{band.name}</div>
                  </div>
                  {isNight ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 14, color: "#e8e8ff", fontWeight: 700, fontSize: 13, textShadow: "1px 1px 0 #000" }}>
                      {MONSTERS.map((m, i) => (
                        <span key={i} style={{ fontSize: 24, animation: `lurk ${2 + i * 0.6}s infinite` }}>{m}</span>
                      ))}
                      <span>睡觉时间，怪物出没…💤</span>
                    </div>
                  ) : (
                    <>
                      {blocks.length === 0 && (
                        <span style={{ color: "#fff", textShadow: "1px 1px 0 #3a3a3a", fontWeight: 700, fontSize: 13, opacity: 0.85 }}>
                          空空的，拖个方块过来吧
                        </span>
                      )}
                      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", paddingBottom: 14 }}>
                        {blocks.map((b) => (
                          <div key={b.id} style={{ animation: "popIn 0.18s" }}>
                            <Block block={b} src={{ kind: "cell", date: dayDate, band: band.key }} size={68} />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== 拖拽幽灵 ===== */}
      {drag && (
        <div style={{
          position: "fixed", left: drag.x - 36, top: drag.y - 36, width: 72, height: 72,
          backgroundImage: TEX[drag.block.tex], backgroundSize: "cover", imageRendering: "pixelated",
          ...bevel(true), display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none", zIndex: 50, transform: "scale(1.1) rotate(-3deg)",
          boxShadow: "6px 8px 0 rgba(0,0,0,0.3)",
        }}>
          <span style={{ fontSize: 30 }}>{drag.block.icon}</span>
        </div>
      )}

      {particles.map((p) => <Particle key={p.key} {...p} />)}
      {flyers.map((f) => <Flyer key={f.key} {...f} />)}

      {toast && (
        <div style={{
          position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)",
          background: "#3a2a1a", color: "#ffe66d", fontWeight: 900, padding: "10px 18px",
          ...bevel(true), zIndex: 60, animation: "popIn 0.15s", fontSize: 14, whiteSpace: "nowrap",
        }}>{toast}</div>
      )}

      {showWorld && (
        <WorldModal stage={worldStage} totalEver={totalEver} nextNeed={nextNeed} onClose={() => setShowWorld(false)} bevel={bevel} />
      )}
      {detail && (
        <DetailModal
          detail={detail}
          bevel={bevel}
          onClose={() => setDetail(null)}
          onRemove={() => { removeBlock(detail.src, detail.block); setDetail(null); }}
          onGoto={() => { setDayDate(detail.src.date); setView("day"); setDetail(null); sndPlace(); }}
        />
      )}
      {showEditor && (
        <BlockEditor
          bevel={bevel}
          onClose={() => setShowEditor(false)}
          onCreate={(blk) => {
            setCustoms((c) => [...c, { ...blk, pid: "c" + Date.now() }]);
            setShowEditor(false);
            sndPop();
            showToast("✨ 新方块造好啦！");
          }}
        />
      )}
    </div>
  );
}

/* ---------- 周视图的一行（时段标签 + 7 个格子） ---------- */
function FragmentRow({ band, dates, days, drag, Block, bevel, today }) {
  const isNight = band.sleep;
  const hairline = "2px solid rgba(0,0,0,0.22)";
  return (
    <>
      <div style={{
        border: hairline, background: band.sky, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: "6px 2px", gap: 2,
      }}>
        <span style={{ fontSize: 20 }}>{band.icon}</span>
        <span style={{ fontWeight: 900, fontSize: 11, color: "#fff", textShadow: "1px 1px 0 #3a3a3a" }}>{band.name}</span>
      </div>
      {dates.map((date, di) => {
        const d = days[date] ?? emptyDay();
        const hovered = drag && drag.hover && drag.hover.date === date && drag.hover.band === band.key;
        if (isNight) {
          return (
            <div key={date} data-cell={`${date}|night`} style={{
              border: hairline, background: band.sky, minHeight: 54,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              outline: hovered ? "3px dashed #e5484d" : "none", outlineOffset: -5,
            }}>
              <span style={{ fontSize: 16, animation: `lurk ${2 + (di % 3) * 0.5}s infinite` }}>{MONSTERS[di % MONSTERS.length]}</span>
              <span style={{ fontSize: 12 }}>💤</span>
            </div>
          );
        }
        return (
          <div key={date} data-cell={`${date}|${band.key}`} style={{
            border: hairline,
            background: date === today ? "rgba(255,230,109,0.30)" : "rgba(255,255,255,0.12)",
            minHeight: 92, padding: 6,
            display: "flex", flexWrap: "wrap", gap: 6, alignItems: "flex-start", alignContent: "flex-start",
            outline: hovered ? "3px dashed #ffe66d" : "none", outlineOffset: -5,
          }}>
            {d[band.key].map((b) => (
              <Block key={b.id} block={b} src={{ kind: "cell", date, band: band.key }} size={40} />
            ))}
          </div>
        );
      })}
    </>
  );
}

/* ---------- 方块详情弹窗（周视图点按） ---------- */
function DetailModal({ detail, onClose, onRemove, onGoto, bevel }) {
  const { block, src } = detail;
  const band = BANDS.find((b) => b.key === src.band);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,15,10,0.55)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#C6C6C6", ...bevel(true), padding: 18, maxWidth: 320, width: "100%", animation: "popIn 0.15s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
          <div style={{
            width: 76, height: 76, flexShrink: 0,
            backgroundImage: TEX[block.tex], backgroundSize: "cover", imageRendering: "pixelated",
            ...bevel(true), display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "3px 3px 0 rgba(0,0,0,0.3)",
          }}>
            <span style={{ fontSize: 34 }}>{block.icon}</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 18, color: "#3a3a3a" }}>{block.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#6a6a6a", marginTop: 4 }}>{TEX_NAMES[block.tex]}</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#3a3a3a", marginTop: 6 }}>
              📍 {fmtMD(src.date)} {DAY_NAMES[dowIdx(src.date)]} · {band.icon} {band.name}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onGoto} style={{
            flex: 1, padding: 10, fontWeight: 900, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
            ...bevel(true), background: "#6dbb45", color: "#fff", textShadow: "1px 1px 0 #3a3a3a",
          }}>☀️ 去这一天</button>
          <button onClick={onRemove} style={{
            flex: 1, padding: 10, fontWeight: 900, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
            ...bevel(true), background: "#C6C6C6", color: "#3a3a3a",
          }}>🧰 移回百宝箱</button>
        </div>
        <div style={{ fontSize: 11, color: "#6a6a6a", marginTop: 10, textAlign: "center" }}>拖动方块可以换到别的格子</div>
      </div>
    </div>
  );
}

/* ---------- 方块工坊 ---------- */
function BlockEditor({ onClose, onCreate, bevel }) {
  const [icon, setIcon] = useState(null);
  const [tex, setTex] = useState("grass");
  const [name, setName] = useState("");
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,15,10,0.65)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#C6C6C6", ...bevel(true), padding: 18, maxWidth: 440, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#3a3a3a" }}>⚒️ 方块工坊</div>
          <button onClick={onClose} style={{ ...bevel(true), background: "#C6C6C6", fontWeight: 900, cursor: "pointer", padding: "2px 10px", fontFamily: "inherit" }}>✕</button>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div style={{
            width: 88, height: 88, backgroundImage: TEX[tex], backgroundSize: "cover", imageRendering: "pixelated",
            ...bevel(true), display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "4px 4px 0 rgba(0,0,0,0.3)",
          }}>
            <span style={{ fontSize: 40 }}>{icon || "❓"}</span>
          </div>
        </div>
        <div style={{ fontWeight: 900, fontSize: 13, color: "#3a3a3a", marginBottom: 6 }}>1️⃣ 挑一个图标</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 14 }}>
          {ICON_LIB.map((ic) => (
            <button key={ic} onClick={() => setIcon(ic)} style={{
              fontSize: 22, padding: "6px 0", cursor: "pointer", fontFamily: "inherit",
              ...bevel(icon !== ic), background: icon === ic ? "#ffe66d" : "#b8b8b8",
            }}>{ic}</button>
          ))}
        </div>
        <div style={{ fontWeight: 900, fontSize: 13, color: "#3a3a3a", marginBottom: 6 }}>2️⃣ 选一种材质</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          {["stone", "grass", "wood"].map((t) => (
            <button key={t} onClick={() => setTex(t)} style={{
              flex: 1, padding: 8, cursor: "pointer", fontFamily: "inherit",
              ...bevel(tex !== t), background: tex === t ? "#ffe66d" : "#b8b8b8",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              fontWeight: 900, fontSize: 11, color: "#3a3a3a",
            }}>
              <div style={{ width: 36, height: 36, backgroundImage: TEX[t], backgroundSize: "cover", imageRendering: "pixelated", border: "2px solid #3a3a3a" }} />
              {TEX_NAMES[t]}
            </button>
          ))}
        </div>
        <div style={{ fontWeight: 900, fontSize: 13, color: "#3a3a3a", marginBottom: 6 }}>
          3️⃣ 起个名字 <span style={{ fontWeight: 400, fontSize: 11 }}>（可以不写，或请爸爸妈妈帮忙）</span>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 6))}
          placeholder="最多 6 个字"
          style={{
            width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 15, fontWeight: 700,
            ...bevel(false), background: "#e8e8e8", outline: "none", fontFamily: "inherit", marginBottom: 16,
          }}
        />
        <button
          disabled={!icon}
          onClick={() => onCreate({ icon, tex, label: name || "我的方块" })}
          style={{
            width: "100%", padding: 12, fontSize: 16, fontWeight: 900, fontFamily: "inherit",
            ...bevel(true), background: icon ? "#6dbb45" : "#a8a8a8",
            color: icon ? "#fff" : "#6a6a6a", cursor: icon ? "pointer" : "not-allowed",
            textShadow: icon ? "1px 1px 0 #3a3a3a" : "none",
          }}
        >⚒️ 做好啦！</button>
      </div>
    </div>
  );
}

/* ---------- 粒子 ---------- */
function Particle({ x, y, dx, dy, rot, size, color }) {
  const [go, setGo] = useState(false);
  useEffect(() => { requestAnimationFrame(() => requestAnimationFrame(() => setGo(true))); }, []);
  return (
    <div style={{
      position: "fixed", left: x, top: y, width: size, height: size, background: color,
      border: "1px solid rgba(0,0,0,0.4)", zIndex: 55, pointerEvents: "none",
      transform: go ? `translate(${dx}px, ${dy + 160}px) rotate(${rot}deg)` : "translate(0,0)",
      opacity: go ? 0 : 1,
      transition: "transform 0.85s cubic-bezier(0.2,0.6,0.4,1), opacity 0.85s ease-in",
    }} />
  );
}

/* ---------- 材料飞入 ---------- */
function Flyer({ tex, x0, y0, x1, y1 }) {
  const [go, setGo] = useState(false);
  useEffect(() => { requestAnimationFrame(() => requestAnimationFrame(() => setGo(true))); }, []);
  return (
    <div style={{
      position: "fixed", left: x0 - 14, top: y0 - 14, width: 28, height: 28,
      backgroundImage: TEX[tex], backgroundSize: "cover", imageRendering: "pixelated",
      border: "2px solid #3a3a3a", zIndex: 55, pointerEvents: "none",
      transform: go ? `translate(${x1 - x0}px, ${y1 - y0}px) scale(0.6)` : "translate(0,0) scale(1.2)",
      transition: "transform 0.6s cubic-bezier(0.4,0,0.6,1)",
    }} />
  );
}

/* ---------- 我的世界 ---------- */
function WorldModal({ stage, totalEver, nextNeed, onClose, bevel }) {
  const px = (n) => n * 6;
  const Cell = ({ x, y, w = 1, h = 1, tex, color }) => (
    <div style={{
      position: "absolute", left: px(x), bottom: px(y), width: px(w), height: px(h),
      backgroundImage: tex ? TEX[tex] : "none", backgroundColor: color || "transparent",
      backgroundSize: `${px(2)}px ${px(2)}px`, imageRendering: "pixelated",
      border: "1px solid rgba(0,0,0,0.25)",
    }} />
  );
  const Emo = ({ x, y, size, children }) => (
    <span style={{ position: "absolute", left: px(x), bottom: px(y), fontSize: size, filter: "drop-shadow(1px 1px 0 rgba(0,0,0,0.4))" }}>{children}</span>
  );
  const stageNames = ["一片空地", "种下小树苗", "围起篱笆", "盖好小屋", "点亮火把和花园", "小狗来安家啦"];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,15,10,0.65)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#C6C6C6", ...bevel(true), padding: 18, maxWidth: 460, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#3a3a3a" }}>🏠 我的世界 · {stageNames[stage]}</div>
          <button onClick={onClose} style={{ ...bevel(true), background: "#C6C6C6", fontWeight: 900, cursor: "pointer", padding: "2px 10px", fontFamily: "inherit" }}>✕</button>
        </div>
        <div style={{ position: "relative", height: 240, background: "linear-gradient(#8fd0f5 0%, #c2e6fa 70%, #6dbb45 70.3%, #5fae3c 100%)", ...bevel(false), overflow: "hidden" }}>
          <Emo x={52} y={30} size={30}>☀️</Emo>
          {stage >= 1 && <Emo x={8} y={12} size={26}>🌱</Emo>}
          {stage >= 2 && [0, 1, 2, 3, 4].map((i) => <Cell key={i} x={16 + i * 3} y={12} w={1} h={3} tex="wood" />)}
          {stage >= 3 && (<>
            <Cell x={36} y={12} w={12} h={7} tex="stone" />
            <Cell x={34} y={19} w={16} h={2} tex="wood" />
            <Cell x={37} y={21} w={10} h={2} tex="wood" />
            <Cell x={40} y={23} w={4} h={2} tex="wood" />
            <Cell x={40.5} y={12} w={3} h={4.5} color="#5a3a1e" />
          </>)}
          {stage >= 4 && (<>
            <Emo x={33} y={19} size={20}>🔥</Emo>
            <Emo x={12} y={11} size={20}>🌷</Emo>
            <Emo x={28} y={11} size={20}>🌼</Emo>
          </>)}
          {stage >= 5 && (<>
            <Emo x={54} y={11} size={26}>🐶</Emo>
            <Emo x={49} y={24} size={20}>🚩</Emo>
          </>)}
          {stage === 0 && (
            <span style={{ position: "absolute", left: "50%", bottom: 90, transform: "translateX(-50%)", color: "#3a3a3a", fontWeight: 700, fontSize: 13, background: "rgba(255,255,255,0.7)", padding: "4px 10px", whiteSpace: "nowrap" }}>
              敲碎方块收集材料，这里会长出东西哦
            </span>
          )}
        </div>
        <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: "#3a3a3a" }}>
          已收集 <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 12 }}>{totalEver}</span> 份材料
          {nextNeed != null
            ? <> — 再收集 <b style={{ color: "#b0342f" }}>{nextNeed - totalEver}</b> 份，小世界会继续长大！</>
            : <> — 🎉 这个世界已经建满啦，你太棒了！</>}
        </div>
      </div>
    </div>
  );
}
