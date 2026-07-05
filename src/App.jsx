import { useState, useRef, useEffect, useCallback } from "react";
import { loadLocal, saveLocal, migrate } from "./lib/storage";
import {
  getCloudSession,
  loadCloudState,
  onCloudAuthChange,
  saveCloudState,
  signInWithEmail,
  signOutCloud,
  supabaseConfig,
} from "./lib/cloud";
import { todayStr, addDays, mondayOf, weekDates, dowIdx, maxMonday, fmtMD, fmtShort, EPOCH_MONDAY } from "./lib/dates";
import { completedMaterialHistory } from "./lib/history";
import { canAddBlock, canPlace, canSmash, validateDropTarget } from "./lib/rules";
import {
  deleteTaskTemplate,
  displayTaskLabel,
  initialTaskTemplates,
  limitTaskLabelInput,
  reorderTaskTemplate,
  updateTaskTemplate,
} from "./lib/templates";

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
const MONSTERS = ["🧟", "🕷️", "💀", "👾"];
const CLOUD_ENABLED = supabaseConfig.isConfigured;

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
  const [templates, setTemplates] = useState(() => initialTaskTemplates(PRESETS, saved));
  const [showEditor, setShowEditor] = useState(false);
  const [editingCustom, setEditingCustom] = useState(null);
  const [materials, setMaterials] = useState(() => saved?.materials ?? { stone: 0, grass: 0, wood: 0 });
  const [totalEver, setTotalEver] = useState(() => saved?.totalEver ?? 0);
  const [particles, setParticles] = useState([]);
  const [flyers, setFlyers] = useState([]);
  const [toast, setToast] = useState(null);
  const [showWorld, setShowWorld] = useState(false);
  const [worldNew, setWorldNew] = useState(false);
  const [drag, setDrag] = useState(null); // {block, src, x, y, hover}
  const [charge, setCharge] = useState(null);
  const [backfill, setBackfill] = useState(false); // 补录模式：临时解锁历史（不持久化）
  const [detail, setDetail] = useState(null); // {block, src} 周视图点击方块的详情弹窗
  const [materialHistoryTex, setMaterialHistoryTex] = useState(null);
  const [cloudSession, setCloudSession] = useState(null);
  const [cloudStatus, setCloudStatus] = useState(CLOUD_ENABLED ? "checking" : "off");
  const [cloudMessage, setCloudMessage] = useState("");
  const [showCloud, setShowCloud] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);

  const gesture = useRef(null);
  const boxRef = useRef(null);
  const hudRef = useRef({});
  const toastTimer = useRef(null);
  const lastToastRef = useRef({ msg: "", t: 0 });
  const cloudTimer = useRef(null);
  const latestStateRef = useRef(saved);
  const firstPersistRef = useRef(true);
  const hasRealLocalRef = useRef(Boolean(saved));
  const viewRef = useRef(view); viewRef.current = view;
  const dayDateRef = useRef(dayDate); dayDateRef.current = dayDate;
  const daysRef = useRef(days); daysRef.current = days;
  const backfillRef = useRef(backfill); backfillRef.current = backfill;
  const ruleOpts = () => ({ today, backfill: backfillRef.current });

  const allBlocks = templates;
  const dayOf = (date) => days[date] ?? emptyDay();
  const setDay = (date, updater) => setDays((ds) => ({ ...ds, [date]: updater(ds[date] ?? emptyDay()) }));

  const showToast = useCallback((msg) => {
    const now = Date.now();
    if (lastToastRef.current.msg === msg && now - lastToastRef.current.t < 450) return;
    lastToastRef.current = { msg, t: now };
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const buildSnapshot = useCallback((updatedAt = Date.now()) => ({
    version: 2,
    days,
    templates,
    materials,
    totalEver,
    updatedAt,
  }), [days, templates, materials, totalEver]);

  const applyCloudState = useCallback((state) => {
    const next = migrate(state, today);
    if (!next) return false;
    setDays(next.days ?? {});
    setTemplates(initialTaskTemplates(PRESETS, next));
    setMaterials(next.materials ?? { stone: 0, grass: 0, wood: 0 });
    setTotalEver(next.totalEver ?? 0);
    saveLocal(next);
    latestStateRef.current = next;
    hasRealLocalRef.current = true;
    return true;
  }, [today]);

  const syncFromCloud = useCallback(async () => {
    if (!CLOUD_ENABLED) return;
    try {
      setCloudStatus("loading");
      const cloud = await loadCloudState();
      const remote = migrate(cloud, today);
      const local = latestStateRef.current;
      if (remote && (!hasRealLocalRef.current || !local || (remote.updatedAt ?? 0) > (local.updatedAt ?? 0))) {
        applyCloudState(remote);
        setCloudStatus("saved");
        setCloudMessage("云端存档已同步到这台设备");
        showToast("☁️ 云端存档已同步");
      } else if (local) {
        await saveCloudState(local);
        setCloudStatus("saved");
        setCloudMessage("这台设备的存档已备份到云端");
      } else {
        setCloudStatus("saved");
      }
    } catch (error) {
      setCloudStatus("error");
      setCloudMessage(`云端同步失败：${error.message}`);
    }
  }, [applyCloudState, showToast, today]);

  /* ---- 本地优先，登录后云端防抖同步 ---- */
  useEffect(() => {
    const isFirstPersist = firstPersistRef.current;
    const snapshot = buildSnapshot(isFirstPersist && saved?.updatedAt ? saved.updatedAt : Date.now());
    firstPersistRef.current = false;
    if (!isFirstPersist || saved) hasRealLocalRef.current = true;
    latestStateRef.current = snapshot;
    saveLocal(snapshot);

    if (!CLOUD_ENABLED || !cloudSession) return;
    clearTimeout(cloudTimer.current);
    setCloudStatus("saving");
    cloudTimer.current = setTimeout(async () => {
      try {
        await saveCloudState(snapshot);
        setCloudStatus("saved");
        setCloudMessage("云端已保存");
      } catch (error) {
        setCloudStatus("error");
        setCloudMessage(`云端保存失败：${error.message}`);
      }
    }, 1200);
    return () => clearTimeout(cloudTimer.current);
  }, [buildSnapshot, cloudSession]);

  useEffect(() => {
    if (!CLOUD_ENABLED) return;
    let alive = true;
    getCloudSession()
      .then((session) => {
        if (!alive) return;
        setCloudSession(session);
        if (session) syncFromCloud();
        else setCloudStatus("signed-out");
      })
      .catch((error) => {
        if (!alive) return;
        setCloudStatus("error");
        setCloudMessage(`云端状态读取失败：${error.message}`);
      });

    const unsubscribe = onCloudAuthChange((session) => {
      setCloudSession(session);
      if (session) syncFromCloud();
      else {
        setCloudStatus("signed-out");
        setCloudMessage("");
      }
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [syncFromCloud]);

  const sendCloudLogin = useCallback(async (email) => {
    if (!email.trim()) {
      setCloudMessage("先输入接收登录链接的邮箱");
      return;
    }
    setCloudBusy(true);
    try {
      await signInWithEmail(email.trim());
      setCloudMessage("登录链接已发送，请打开邮件完成登录");
    } catch (error) {
      setCloudMessage(`发送失败：${error.message}`);
    } finally {
      setCloudBusy(false);
    }
  }, []);

  const disconnectCloud = useCallback(async () => {
    setCloudBusy(true);
    try {
      await signOutCloud();
      setCloudSession(null);
      setCloudStatus("signed-out");
      setCloudMessage("已退出云端存档，本机存档仍保留");
    } catch (error) {
      setCloudMessage(`退出失败：${error.message}`);
    } finally {
      setCloudBusy(false);
    }
  }, []);

  // 补录模式入口：1.5 秒内连点标题 5 次
  const tapCount = useRef({ n: 0, t: 0 });
  const onTitleTap = () => {
    const now = Date.now();
    if (now - tapCount.current.t > 1500) tapCount.current.n = 0;
    tapCount.current = { n: tapCount.current.n + 1, t: now };
    if (tapCount.current.n >= 5) {
      tapCount.current.n = 0;
      setBackfill(true);
      showToast("🔧 补录模式已开启");
    }
  };

  const stageOf = (n) => (n >= 12 ? 5 : n >= 8 ? 4 : n >= 5 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0);
  const worldStage = stageOf(totalEver);
  const nextNeed = [1, 3, 5, 8, 12][worldStage] ?? null;
  const materialHistory = materialHistoryTex ? completedMaterialHistory(days, materialHistoryTex) : [];

  /* ---- 放置 / 移动 ---- */
  const placeBlock = useCallback((src, block, dDate, dBand) => {
    setDays((ds) => {
      const get = (date) => ds[date] ?? emptyDay();
      if (src.kind === "cell" && src.date === dDate && src.band === dBand) return ds; // 原地不动
      if (!canAddBlock(get(dDate)[dBand])) return ds;
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

  const deleteTemplate = useCallback((pid) => {
    setTemplates((blocks) => deleteTaskTemplate(blocks, pid));
    setEditingCustom(null);
    setShowEditor(false);
    showToast("任务已从百宝箱删除，日程里的记录还在");
  }, [showToast]);

  const openNewCustomEditor = useCallback(() => {
    setEditingCustom(null);
    setShowEditor(true);
  }, []);

  const openEditCustomEditor = useCallback((block) => {
    setEditingCustom(block);
    setShowEditor(true);
  }, []);

  const closeCustomEditor = useCallback(() => {
    setShowEditor(false);
    setEditingCustom(null);
  }, []);

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

  const findTemplateAt = (x, y) => {
    const tiles = document.querySelectorAll("[data-template]");
    for (const el of tiles) {
      if (inRect(el.getBoundingClientRect(), x, y)) return el.getAttribute("data-template");
    }
    return null;
  };

  /* ---- 手势 ---- */
  const onBlockDown = (e, block, src) => {
    if (e.button != null && e.button !== 0) return;
    ensureAudio();
    e.preventDefault();
    const g = { block, src, x0: e.clientX, y0: e.clientY, mode: "pending", chargeTimer: null, chargeStart: 0, downAt: performance.now() };
    gesture.current = g;
    const isDone = src.kind === "cell" && !!block.done;
    // 长按敲碎：仅日视图内、已放置且未完成、日期允许（今天/昨天/补录）的方块
    if (src.kind === "cell" && viewRef.current === "day" && !isDone && canSmash(src.date, ruleOpts())) {
      g.chargeStart = performance.now();
      g.chargeTimer = setInterval(() => {
        const el = performance.now() - g.chargeStart;
        if (el >= 320) {
          const st = Math.min(3, Math.floor((el - 320) / 180) + 1);
          setCharge((c) => { if (!c || c.stage !== st) sndDig(); return { id: block.id, stage: st }; });
        }
        if (el >= 900) {
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
      const held = performance.now() - gg.downAt;
      const canDragNow = gg.src.kind === "box" || held >= 220;
      if (gg.mode === "pending" && canDragNow && !(gg.src.kind === "cell" && (gg.block.done || !canPlace(gg.src.date, ruleOpts()))) && Math.hypot(ev.clientX - gg.x0, ev.clientY - gg.y0) > 8) {
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
          // 点按百宝箱：进入当前任务模板编辑；拖动仍用于摆放
          openEditCustomEditor(gg.block);
        } else if (gg.mode === "pending" && gg.src.kind === "cell") {
          // 点按已放置的方块 → 详情弹窗；更长按不移动才会敲碎
          setDetail({ block: gg.block, src: gg.src });
        } else if (gg.mode === "drag") {
          const cell = findCellAt(ev.clientX, ev.clientY);
          if (cell) {
            const validation = validateDropTarget(cell.date, cell.band, ruleOpts());
            if (!validation.ok) {
              if (validation.reason === "night") sndGrowl();
              showToast(validation.message);
            } else {
              placeBlock(gg.src, gg.block, cell.date, cell.band);
            }
          } else if (gg.src.kind === "box") {
            const targetPid = findTemplateAt(ev.clientX, ev.clientY);
            if (targetPid && targetPid !== gg.block.pid) {
              setTemplates((blocks) => reorderTaskTemplate(blocks, gg.block.pid, targetPid));
              showToast("百宝箱顺序已调整");
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
    <button ref={(el) => (hudRef.current[tex] = el)} onClick={() => setMaterialHistoryTex(tex)} title={`查看${TEX_NAMES[tex]}完成历史`} style={{
      display: "flex", alignItems: "center", gap: 6, background: "#8B8B8B",
      ...bevel(false), padding: "4px 8px",
      cursor: "pointer", fontFamily: "inherit",
    }}>
      <div style={{ width: 22, height: 22, backgroundImage: TEX[tex], backgroundSize: "cover", imageRendering: "pixelated", border: "2px solid #3a3a3a" }} />
      <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 13, color: "#fff", textShadow: "2px 2px 0 #3a3a3a", minWidth: 22 }}>{materials[tex]}</span>
    </button>
  );

  const Block = ({ block, src, size = 68, showLabel = true }) => {
    const charging = charge && charge.id === block.id;
    const dim = drag && drag.src.kind === "cell" && drag.block.id === block.id;
    const isDone = !!block.done;
    return (
      <div
        id={"blk-" + block.id}
        onPointerDown={(e) => onBlockDown(e, block, src)}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          width: size, height: size, position: "relative", flexShrink: 0,
          backgroundImage: TEX[block.tex], backgroundSize: "cover", imageRendering: "pixelated",
          ...bevel(true),
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: isDone ? "default" : "grab", touchAction: "none", userSelect: "none",
          WebkitUserSelect: "none", WebkitTouchCallout: "none",
          opacity: dim ? 0.25 : isDone ? 0.45 : 1,
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
          }}>{displayTaskLabel(block.label)}</span>
        )}
        {charging && <Cracks stage={charge.stage} />}
        {isDone && <Cracks stage={3} />}
        {isDone && (
          <span style={{
            position: "absolute", top: -8, right: -8, width: 20, height: 20,
            background: "#6dbb45", border: "2px solid #fff", color: "#fff",
            fontSize: 13, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}>✔</span>
        )}
      </div>
    );
  };

  const TemplateTile = ({ preset, size, labelSize }) => {
    return (
      <div data-template={preset.pid} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0, minWidth: size + 4 }}>
        <Block block={{ ...preset, id: "tpl-" + preset.pid }} src={{ kind: "box" }} size={size} showLabel={false} />
        <span title={preset.label} style={{ fontSize: labelSize, fontWeight: 900, color: "#3a3a3a", whiteSpace: "nowrap" }}>{displayTaskLabel(preset.label)}</span>
      </div>
    );
  };

  const NewTemplateTile = ({ size }) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0, minWidth: size + 4 }}>
        <button onClick={openNewCustomEditor} style={{
          width: size, height: size, flexShrink: 0, ...bevel(true), background: "#a8a8a8",
          padding: 0, appearance: "none",
          fontWeight: 900, color: "#3a3a3a", cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
          fontFamily: "inherit",
        }}>
          <span style={{ fontSize: Math.round(size * 0.34), lineHeight: 1 }}>＋</span>
          <span style={{ fontSize: Math.max(9, Math.round(size * 0.16)), lineHeight: 1, whiteSpace: "nowrap" }}>造方块</span>
        </button>
      </div>
    );
  };

  const vertical = typeof window !== "undefined" && window.innerWidth < 640;
  const day = dayOf(dayDate);
  const dates = weekDates(anchorMonday);
  const cloudLabel = !CLOUD_ENABLED
    ? "☁️ 未配置"
    : cloudSession
      ? (cloudStatus === "saving" || cloudStatus === "loading" ? "☁️ 同步中" : "☁️ 已同步")
      : "☁️ 云端存档";

  return (
    <div style={{
      height: "100dvh", minHeight: "100dvh", fontFamily: "'PingFang SC','Microsoft YaHei',sans-serif",
      background: "linear-gradient(#79b8e8 0%, #a8d8f0 55%, #6dbb45 55.2%, #5fae3c 100%)",
      display: "flex", flexDirection: "column", overflow: "hidden", position: "relative",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        @keyframes shake { 0%{transform:translate(0,0)} 25%{transform:translate(-2px,1px)} 50%{transform:translate(2px,-1px)} 75%{transform:translate(-1px,-2px)} 100%{transform:translate(1px,2px)} }
        @keyframes popIn { from{transform:scale(0.4);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes toastIn { from{transform:translateX(-50%) scale(0.92);opacity:0} to{transform:translateX(-50%) scale(1);opacity:1} }
        @keyframes floaty { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes lurk { 0%,100%{transform:translateX(0)} 50%{transform:translateX(6px)} }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
      `}</style>

      {/* ===== HUD ===== */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", flexWrap: "wrap" }}>
        <h1 onClick={onTitleTap} style={{
          margin: 0, display: "flex", alignItems: "center", gap: 8,
          lineHeight: 1.05, color: "#fff", textShadow: "2px 2px 0 #3a3a3a",
          cursor: "default", userSelect: "none",
        }}>
          <span style={{
            width: 34, height: 34, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(58,42,26,0.22)", border: "2px solid rgba(255,255,255,0.72)",
            boxShadow: "2px 2px 0 rgba(58,42,26,0.55)", fontSize: 22,
          }}>⛏️</span>
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
            <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 15 }}>DaysCraft</span>
            <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: 2 }}>方块时间</span>
          </span>
        </h1>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <PixBtn active={view === "week"} onClick={() => setView("week")}>🗓️ 一周规划</PixBtn>
          <PixBtn active={view === "day"} onClick={() => { setDayDate(today); setView("day"); }}>☀️ 今日</PixBtn>
          {view === "week" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <PixBtn onClick={() => setAnchorMonday((m) => (m > EPOCH_MONDAY ? addDays(m, -7) : m))}
                style={{ opacity: anchorMonday > EPOCH_MONDAY ? 1 : 0.35 }}>‹</PixBtn>
              <span style={{
                fontWeight: 900, fontSize: 13, color: "#fff", textShadow: "1px 1px 0 #3a3a3a",
                minWidth: 128, textAlign: "center", background: "#8B8B8B", ...bevel(false),
                padding: "6px 10px",
              }}>
                {fmtMD(anchorMonday)} – {fmtMD(addDays(anchorMonday, 6))}
              </span>
              <PixBtn onClick={() => setAnchorMonday((m) => (m < maxMonday() ? addDays(m, 7) : m))}
                style={{ opacity: anchorMonday < maxMonday() ? 1 : 0.35 }}>›</PixBtn>
            </div>
          )}
          {view === "day" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <PixBtn onClick={() => setDayDate((d) => (d > EPOCH_MONDAY ? addDays(d, -1) : d))}
                style={{ opacity: dayDate > EPOCH_MONDAY ? 1 : 0.35 }}>‹</PixBtn>
              <span style={{
                fontWeight: 900, fontSize: 14, color: "#fff", textShadow: "1px 1px 0 #3a3a3a",
                minWidth: 136, textAlign: "center", background: "#8B8B8B", ...bevel(false),
                padding: "6px 10px",
              }}>
                {fmtMD(dayDate)} {DAY_NAMES[dowIdx(dayDate)]}{dayDate === today ? "（今天）" : ""}
              </span>
              <PixBtn onClick={() => setDayDate((d) => (d < addDays(maxMonday(), 6) ? addDays(d, 1) : d))}
                style={{ opacity: dayDate < addDays(maxMonday(), 6) ? 1 : 0.35 }}>›</PixBtn>
            </div>
          )}
        </div>
        <MatCounter tex="stone" />
        <MatCounter tex="grass" />
        <MatCounter tex="wood" />
        <PixBtn onClick={() => setShowCloud(true)} style={{
          background: cloudSession ? "#b8e6ff" : "#C6C6C6",
          color: "#3a3a3a",
        }}>{cloudLabel}</PixBtn>
        <PixBtn onClick={() => { ensureAudio(); setShowWorld(true); setWorldNew(false); }} style={{ position: "relative" }}>
          🏠 我的世界
          {worldNew && <span style={{ position: "absolute", top: -6, right: -6, width: 14, height: 14, background: "#e5484d", border: "2px solid #fff" }} />}
        </PixBtn>
      </div>

      {/* ===== 补录模式横幅 ===== */}
      {backfill && (
        <button onClick={() => { setBackfill(false); showToast("补录模式已关闭"); }} style={{
          ...bevel(true), background: "#e8912d", color: "#fff", textShadow: "1px 1px 0 #3a3a3a",
          fontWeight: 900, fontSize: 13, padding: "8px 12px", margin: "0 14px 8px",
          cursor: "pointer", fontFamily: "inherit", textAlign: "center",
        }}>🔧 补录模式 — 历史日子已解锁，点这里关闭</button>
      )}

      {/* ===== 提示语 ===== */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px 8px", minHeight: 18 }}>
        {view === "day" && canSmash(dayDate, { today, backfill }) && (
          <span style={{ fontWeight: 900, fontSize: 13, color: "#fff", textShadow: "1px 1px 0 #3a3a3a" }}>
            做完一件，点方块详情里的「敲碎完成」，也可以长按快捷完成！🔨
          </span>
        )}
        {view === "week" && (
          <span style={{ fontWeight: 700, fontSize: 12, color: "#fff", textShadow: "1px 1px 0 #3a3a3a" }}>
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
                  border: "2px solid rgba(0,0,0,0.25)",
                  background: date === today ? "#ffe66d" : date < today ? "rgba(200,200,200,0.55)" : "rgba(255,255,255,0.75)",
                  fontWeight: 900, fontSize: 12, padding: "8px 2px", cursor: "pointer", fontFamily: "inherit",
                  color: "#3a3a3a",
                }}>
                  {date === today ? "☀️ " : ""}{DAY_NAMES[i]} {fmtShort(date)}
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
              🧰 百宝箱 <span style={{ fontWeight: 400, fontSize: 11 }}>拖进格子 · 点按编辑</span>
            </div>
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4, alignItems: "flex-start" }}>
              {allBlocks.map((p) => (
                <TemplateTile key={p.pid} preset={p} size={56} labelSize={12} />
              ))}
              <NewTemplateTile size={56} labelSize={12} />
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
              🧰 百宝箱 <span style={{ fontWeight: 400, fontSize: 11 }}>拖出去摆放 · 点按编辑</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: vertical ? "repeat(5,1fr)" : "repeat(2,1fr)", gap: "10px 6px", justifyItems: "center" }}>
              {allBlocks.map((p) => (
                <TemplateTile key={p.pid} preset={p} size={60} labelSize={11} />
              ))}
              <NewTemplateTile size={60} labelSize={11} />
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

      {particles.map(({ key, ...p }) => <Particle key={key} {...p} />)}
      {flyers.map(({ key, ...f }) => <Flyer key={key} {...f} />)}

      {toast && (
        <div style={{
          position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)",
          background: "#3a2a1a", color: "#ffe66d", fontWeight: 900, padding: "10px 18px",
          ...bevel(true), zIndex: 60, animation: "toastIn 0.15s", fontSize: 14, whiteSpace: "nowrap",
        }}>{toast}</div>
      )}

      {showWorld && (
        <WorldModal stage={worldStage} totalEver={totalEver} nextNeed={nextNeed} onClose={() => setShowWorld(false)} bevel={bevel} />
      )}
      {materialHistoryTex && (
        <MaterialHistoryModal
          tex={materialHistoryTex}
          records={materialHistory}
          bevel={bevel}
          onClose={() => setMaterialHistoryTex(null)}
        />
      )}
      {showCloud && (
        <CloudModal
          bevel={bevel}
          configured={CLOUD_ENABLED}
          session={cloudSession}
          status={cloudStatus}
          message={cloudMessage}
          busy={cloudBusy}
          onClose={() => setShowCloud(false)}
          onLogin={sendCloudLogin}
          onSync={syncFromCloud}
          onSignOut={disconnectCloud}
        />
      )}
      {detail && (
        <DetailModal
          detail={detail}
          bevel={bevel}
          canEdit={canPlace(detail.src.date, { today, backfill })}
          canComplete={!detail.block.done && canSmash(detail.src.date, { today, backfill })}
          onClose={() => setDetail(null)}
          onRemove={() => { removeBlock(detail.src, detail.block); setDetail(null); }}
          onComplete={() => { smash(detail.src, detail.block); setDetail(null); }}
          onGoto={() => { setDayDate(detail.src.date); setView("day"); setDetail(null); sndPlace(); }}
        />
      )}
      {showEditor && (
        <BlockEditor
          bevel={bevel}
          editingBlock={editingCustom}
          onClose={closeCustomEditor}
          onCreate={(blk) => {
            setTemplates((blocks) => [...blocks, { ...blk, pid: "c" + Date.now() }]);
            closeCustomEditor();
            sndPop();
            showToast("✨ 新方块造好啦！");
          }}
          onUpdate={(blk) => {
            setTemplates((blocks) => updateTaskTemplate(blocks, blk));
            closeCustomEditor();
            sndPop();
            showToast("任务已更新");
          }}
          onDelete={deleteTemplate}
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
            background: date === today ? "rgba(255,230,109,0.30)" : date < today ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.12)",
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

/* ---------- 云端存档 ---------- */
function CloudModal({ configured, session, status, message, busy, onClose, onLogin, onSync, onSignOut, bevel }) {
  const [email, setEmail] = useState(session?.user?.email ?? "");
  const statusText = {
    checking: "检查中",
    "signed-out": "未登录",
    loading: "同步中",
    saving: "保存中",
    saved: "已同步",
    error: "需要处理",
    off: "未配置",
  }[status] ?? status;

  const actionButton = (children, onClick, background = "#6dbb45") => (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        flex: 1,
        padding: 10,
        fontWeight: 900,
        fontSize: 13,
        fontFamily: "inherit",
        cursor: busy ? "wait" : "pointer",
        ...bevel(true),
        background,
        color: background === "#C6C6C6" ? "#3a3a3a" : "#fff",
        textShadow: background === "#C6C6C6" ? "none" : "1px 1px 0 #3a3a3a",
      }}
    >
      {children}
    </button>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,15,10,0.65)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#C6C6C6", ...bevel(true), padding: 18, maxWidth: 390, width: "100%", animation: "popIn 0.15s" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#3a3a3a" }}>☁️ 云端存档</div>
          <button onClick={onClose} style={{ ...bevel(true), background: "#C6C6C6", fontWeight: 900, cursor: "pointer", padding: "2px 10px", fontFamily: "inherit" }}>✕</button>
        </div>

        <div style={{ background: "#e8e8e8", ...bevel(false), padding: 10, marginBottom: 12, color: "#3a3a3a", fontSize: 13, fontWeight: 700 }}>
          状态：<b>{statusText}</b>
          {session?.user?.email ? <div style={{ marginTop: 6, wordBreak: "break-all" }}>{session.user.email}</div> : null}
        </div>

        {!configured ? (
          <div style={{ color: "#3a3a3a", fontSize: 13, fontWeight: 700, lineHeight: 1.6 }}>
            本机还没有 Supabase 环境变量。配置后重新启动应用即可开启。
          </div>
        ) : session ? (
          <div style={{ display: "flex", gap: 8 }}>
            {actionButton("立即同步", onSync)}
            {actionButton("退出", onSignOut, "#C6C6C6")}
          </div>
        ) : (
          <>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="邮箱"
              type="email"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                fontSize: 15,
                fontWeight: 700,
                ...bevel(false),
                background: "#e8e8e8",
                outline: "none",
                fontFamily: "inherit",
                marginBottom: 10,
              }}
            />
            {actionButton(busy ? "发送中..." : "发送登录链接", () => onLogin(email))}
          </>
        )}

        {message && (
          <div style={{ marginTop: 12, color: status === "error" ? "#b0342f" : "#3a3a3a", fontSize: 12, fontWeight: 700, lineHeight: 1.5 }}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- 方块详情弹窗（周视图点按） ---------- */
function DetailModal({ detail, onClose, onRemove, onComplete, onGoto, bevel, canEdit, canComplete }) {
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canComplete && (
            <button onClick={onComplete} style={{
              flex: "1 1 130px", padding: 10, fontWeight: 900, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
              ...bevel(true), background: "#e8912d", color: "#fff", textShadow: "1px 1px 0 #3a3a3a",
            }}>🔨 敲碎完成</button>
          )}
          <button onClick={onGoto} style={{
            flex: "1 1 110px", padding: 10, fontWeight: 900, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
            ...bevel(true), background: "#6dbb45", color: "#fff", textShadow: "1px 1px 0 #3a3a3a",
          }}>☀️ 去这一天</button>
          {block.done ? (
            <div style={{ flex: "1 1 110px", padding: 10, fontWeight: 900, fontSize: 13, textAlign: "center", color: "#3a3a3a", background: "#b8e6a3", ...bevel(false) }}>✔ 已完成</div>
          ) : canEdit ? (
            <button onClick={onRemove} style={{
              flex: "1 1 130px", padding: 10, fontWeight: 900, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
              ...bevel(true), background: "#C6C6C6", color: "#3a3a3a",
            }}>🧰 移回百宝箱</button>
          ) : (
            <div style={{ flex: "1 1 130px", padding: 10, fontWeight: 700, fontSize: 13, textAlign: "center", color: "#6a6a6a", background: "#d8d8d8", ...bevel(false) }}>💤 过去的日子只能看看</div>
          )}
        </div>
        <div style={{ fontSize: 11, color: "#6a6a6a", marginTop: 10, textAlign: "center" }}>
          {block.done ? "已完成的记录会留在日程里" : canComplete ? "也可以点按钮完成，长按只是快捷方式" : canEdit ? "按住后拖动方块可以换到别的格子" : "过去的日子只能查看"}
        </div>
      </div>
    </div>
  );
}

/* ---------- 材料完成历史 ---------- */
function MaterialHistoryModal({ tex, records, onClose, bevel }) {
  const bandName = (key) => BANDS.find((b) => b.key === key)?.name ?? key;
  const doneTime = (value) => {
    if (!value) return "完成时间未记录";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "完成时间未记录";
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,15,10,0.55)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#C6C6C6", ...bevel(true), padding: 18, maxWidth: 440, width: "100%", maxHeight: "82vh", overflowY: "auto", animation: "popIn 0.15s" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900, fontSize: 16, color: "#3a3a3a" }}>
            <div style={{ width: 28, height: 28, backgroundImage: TEX[tex], backgroundSize: "cover", imageRendering: "pixelated", border: "2px solid #3a3a3a" }} />
            {TEX_NAMES[tex]}完成历史
          </div>
          <button onClick={onClose} style={{ ...bevel(true), background: "#C6C6C6", fontWeight: 900, cursor: "pointer", padding: "2px 10px", fontFamily: "inherit" }}>✕</button>
        </div>

        {records.length === 0 ? (
          <div style={{ color: "#3a3a3a", fontSize: 13, fontWeight: 700, lineHeight: 1.6, background: "#e8e8e8", ...bevel(false), padding: 12 }}>
            还没有完成过这种材料的任务。
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {records.map((record) => (
              <div key={`${record.date}-${record.band}-${record.id}`} style={{ display: "flex", gap: 10, alignItems: "center", background: "#e8e8e8", ...bevel(false), padding: 10 }}>
                <div style={{ width: 44, height: 44, flexShrink: 0, backgroundImage: TEX[record.tex], backgroundSize: "cover", imageRendering: "pixelated", ...bevel(true), display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 22 }}>{record.icon}</span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, color: "#3a3a3a", fontSize: 14 }}>{record.label}</div>
                  <div style={{ fontWeight: 700, color: "#6a6a6a", fontSize: 12, marginTop: 3 }}>
                    {fmtMD(record.date)} {DAY_NAMES[dowIdx(record.date)]} · {bandName(record.band)} · {doneTime(record.doneAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- 方块工坊 ---------- */
function BlockEditor({ editingBlock, onClose, onCreate, onUpdate, onDelete, bevel }) {
  const isEditing = Boolean(editingBlock);
  const [icon, setIcon] = useState(editingBlock?.icon ?? null);
  const [tex, setTex] = useState(editingBlock?.tex ?? "grass");
  const [name, setName] = useState(editingBlock?.label ?? "");
  useEffect(() => {
    setIcon(editingBlock?.icon ?? null);
    setTex(editingBlock?.tex ?? "grass");
    setName(editingBlock?.label ?? "");
  }, [editingBlock]);

  const save = () => {
    const next = { icon, tex, label: name || "我的方块" };
    if (isEditing) onUpdate({ ...next, pid: editingBlock.pid });
    else onCreate(next);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,15,10,0.65)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#C6C6C6", ...bevel(true), padding: 18, width: "min(80vw, 760px)", maxWidth: "calc(100vw - 24px)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 16, color: "#3a3a3a" }}>⚒️ {isEditing ? "编辑方块" : "方块工坊"}</div>
          <button onClick={onClose} style={{ ...bevel(true), background: "#C6C6C6", fontWeight: 900, cursor: "pointer", padding: "2px 10px", fontFamily: "inherit" }}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "112px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 96, height: 96, backgroundImage: TEX[tex], backgroundSize: "cover", imageRendering: "pixelated",
              ...bevel(true), display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "4px 4px 0 rgba(0,0,0,0.3)",
            }}>
              <span style={{ fontSize: 42 }}>{icon || "❓"}</span>
            </div>
            <div style={{ fontSize: 12, color: "#3a3a3a", fontWeight: 900, textAlign: "center" }}>{name || "我的方块"}</div>
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 13, color: "#3a3a3a", marginBottom: 6 }}>1️⃣ 选一种材质</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              {["stone", "grass", "wood"].map((t) => (
                <button key={t} onClick={() => setTex(t)} style={{
                  flex: "1 1 140px", padding: 8, cursor: "pointer", fontFamily: "inherit",
                  ...bevel(tex !== t), background: tex === t ? "#ffe66d" : "#b8b8b8",
                  display: "flex", alignItems: "center", gap: 8,
                  fontWeight: 900, fontSize: 11, color: "#3a3a3a",
                }}>
                  <div style={{ width: 34, height: 34, backgroundImage: TEX[t], backgroundSize: "cover", imageRendering: "pixelated", border: "2px solid #3a3a3a", flexShrink: 0 }} />
                  {TEX_NAMES[t]}
                </button>
              ))}
            </div>

            <div style={{ fontWeight: 900, fontSize: 13, color: "#3a3a3a", marginBottom: 6 }}>2️⃣ 挑一个图标</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(42px, 1fr))", gap: 6, marginBottom: 14 }}>
              {ICON_LIB.map((ic) => (
                <button key={ic} onClick={() => setIcon(ic)} style={{
                  fontSize: 22, padding: "6px 0", cursor: "pointer", fontFamily: "inherit",
                  ...bevel(icon !== ic), background: icon === ic ? "#ffe66d" : "#b8b8b8",
                }}>{ic}</button>
              ))}
            </div>

            <div style={{ fontWeight: 900, fontSize: 13, color: "#3a3a3a", marginBottom: 6 }}>
              3️⃣ 起个名字 <span style={{ fontWeight: 400, fontSize: 11 }}>（48 字以内，日程里会简写）</span>
            </div>
            <input
              value={name}
              onChange={(e) => setName(limitTaskLabelInput(e.target.value))}
              placeholder="最多 48 个字"
              style={{
                width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 15, fontWeight: 700,
                ...bevel(false), background: "#e8e8e8", outline: "none", fontFamily: "inherit", marginBottom: 16,
              }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                disabled={!icon}
                onClick={save}
                style={{
                  flex: "1 1 220px", padding: 12, fontSize: 16, fontWeight: 900, fontFamily: "inherit",
                  ...bevel(true), background: icon ? "#6dbb45" : "#a8a8a8",
                  color: icon ? "#fff" : "#6a6a6a", cursor: icon ? "pointer" : "not-allowed",
                  textShadow: icon ? "1px 1px 0 #3a3a3a" : "none",
                }}
              >{isEditing ? "💾 保存修改" : "⚒️ 做好啦！"}</button>
              {isEditing && (
                <button
                  onClick={() => onDelete(editingBlock.pid)}
                  style={{
                    flex: "0 1 150px", padding: 12, fontSize: 16, fontWeight: 900, fontFamily: "inherit",
                    ...bevel(true), background: "#C6C6C6", color: "#3a3a3a", cursor: "pointer",
                  }}
                >删除</button>
              )}
            </div>
          </div>
        </div>
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
