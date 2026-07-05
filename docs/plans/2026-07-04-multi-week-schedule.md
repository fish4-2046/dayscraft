# 多周日程与历史记录 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把单周抽象日程改造成挂真实日期、可翻页回看历史的多周日程表（起点 2026-06-22 那周，最远到下周），敲碎改为标记完成，附带家长补录模式。

**Architecture:** 数据从「7 元素周数组」改为「按日期 keyed 的 days map」（本地日期字符串 `YYYY-MM-DD`），周视图变成派生视图。日期工具、编辑规则、存档迁移拆成三个纯函数模块（Vitest 覆盖），App.jsx 只做接线与渲染。存档升级 `version: 2`，v1 自动迁移。

**Tech Stack:** React 19 + Vite 7，新增 Vitest（纯逻辑模块测试）。UI 手势逻辑通过 preview 手动验证。

**设计文档:** `../../../项目需求/方块日程-多周日程与历史记录设计.md`

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/lib/dates.js`（新建） | 本地日期字符串工具：todayStr / addDays / mondayOf / weekDates / dowIdx / 格式化 / 范围常量 |
| `src/lib/rules.js`（新建） | 编辑规则纯函数：canPlace / canSmash（含补录覆盖），可注入 today 便于测试 |
| `src/lib/storage.js`（修改） | 增加 v1→v2 迁移函数 migrate，loadLocal 返回迁移后数据 |
| `src/App.jsx`（修改） | days map 状态、date 化的手势/格子、done 形态、周/日导航、补录模式 |
| `src/lib/*.test.js`（新建） | 三个逻辑模块的 Vitest 测试 |

约定：日期一律为**本地时区**的 `YYYY-MM-DD` 字符串（可直接字符串比较大小）；一周从周一开始。

---

### Task 1: Vitest 基建 + 日期工具模块

**Files:**
- Modify: `package.json`
- Create: `src/lib/dates.js`
- Test: `src/lib/dates.test.js`

- [ ] **Step 1: 安装 Vitest 并加 test 脚本**

```bash
cd "/Users/fishsean/Documents/MyWorkOS/01项目/2607方块时间/DaysCraft"
npm install -D vitest
```

在 `package.json` 的 `scripts` 中加入：

```json
"test": "vitest run"
```

- [ ] **Step 2: 写失败测试 `src/lib/dates.test.js`**

```js
import { describe, it, expect } from 'vitest'
import {
  toStr, fromStr, addDays, mondayOf, weekDates, dowIdx,
  fmtMD, fmtShort, EPOCH_MONDAY,
} from './dates'

describe('dates', () => {
  it('toStr/fromStr 往返一致（本地时区）', () => {
    expect(toStr(new Date(2026, 6, 4))).toBe('2026-07-04')
    expect(toStr(fromStr('2026-07-04'))).toBe('2026-07-04')
  })

  it('addDays 跨月跨年', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01')
    expect(addDays('2026-07-01', -1)).toBe('2026-06-30')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('mondayOf：周一为一周起点', () => {
    expect(mondayOf('2026-07-04')).toBe('2026-06-29') // 周六
    expect(mondayOf('2026-06-29')).toBe('2026-06-29') // 周一本身
    expect(mondayOf('2026-07-05')).toBe('2026-06-29') // 周日属于同一周
  })

  it('weekDates 连续 7 天且可跨月', () => {
    const w = weekDates('2026-06-29')
    expect(w).toHaveLength(7)
    expect(w[0]).toBe('2026-06-29')
    expect(w[2]).toBe('2026-07-01')
    expect(w[6]).toBe('2026-07-05')
  })

  it('dowIdx：周一=0 … 周日=6', () => {
    expect(dowIdx('2026-06-29')).toBe(0)
    expect(dowIdx('2026-07-04')).toBe(5)
    expect(dowIdx('2026-07-05')).toBe(6)
  })

  it('格式化', () => {
    expect(fmtMD('2026-07-04')).toBe('7月4日')
    expect(fmtShort('2026-07-04')).toBe('7/4')
  })

  it('起点常量', () => {
    expect(EPOCH_MONDAY).toBe('2026-06-22')
    expect(dowIdx(EPOCH_MONDAY)).toBe(0) // 必须是周一
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run src/lib/dates.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现 `src/lib/dates.js`**

```js
// 本地日期工具：日期一律用本地时区的 "YYYY-MM-DD" 字符串，一周从周一开始
export const EPOCH_MONDAY = '2026-06-22' // 日程表能翻到的最早一周的周一

export function toStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fromStr(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayStr() {
  return toStr(new Date())
}

export function addDays(s, n) {
  const d = fromStr(s)
  d.setDate(d.getDate() + n)
  return toStr(d)
}

export function dowIdx(s) {
  return (fromStr(s).getDay() + 6) % 7 // 周一=0 … 周日=6
}

export function mondayOf(s) {
  return addDays(s, -dowIdx(s))
}

export function weekDates(mondayStr) {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayStr, i))
}

export function maxMonday() {
  return addDays(mondayOf(todayStr()), 7) // 最远可翻到下周
}

export function fmtMD(s) {
  const d = fromStr(s)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function fmtShort(s) {
  const d = fromStr(s)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run src/lib/dates.test.js`
Expected: PASS（7 个用例）

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/dates.js src/lib/dates.test.js
git commit -m "feat: 日期工具模块与 Vitest 基建（本地日期字符串、周一起始）"
```

---

### Task 2: 编辑规则模块

**Files:**
- Create: `src/lib/rules.js`
- Test: `src/lib/rules.test.js`

规则表（设计文档第 4 节）：今天可摆可敲；昨天只可补敲；更早只读；未来只摆不敲；补录模式全开。`today` 参数可注入，默认取当前日期。

- [ ] **Step 1: 写失败测试 `src/lib/rules.test.js`**

```js
import { describe, it, expect } from 'vitest'
import { canPlace, canSmash } from './rules'

const T = '2026-07-04' // 固定"今天"便于断言

describe('canPlace（摆块/移动/移回）', () => {
  it('今天和未来可摆', () => {
    expect(canPlace('2026-07-04', { today: T })).toBe(true)
    expect(canPlace('2026-07-05', { today: T })).toBe(true)
    expect(canPlace('2026-07-12', { today: T })).toBe(true)
  })
  it('昨天及更早不可摆', () => {
    expect(canPlace('2026-07-03', { today: T })).toBe(false)
    expect(canPlace('2026-06-22', { today: T })).toBe(false)
  })
  it('补录模式下历史可摆', () => {
    expect(canPlace('2026-06-22', { today: T, backfill: true })).toBe(true)
  })
})

describe('canSmash（敲碎）', () => {
  it('今天可敲', () => {
    expect(canSmash('2026-07-04', { today: T })).toBe(true)
  })
  it('昨天可补敲（含跨周：周一的昨天是上周日）', () => {
    expect(canSmash('2026-07-03', { today: T })).toBe(true)
    expect(canSmash('2026-07-05', { today: '2026-07-06' })).toBe(true)
  })
  it('前天及更早、未来不可敲', () => {
    expect(canSmash('2026-07-02', { today: T })).toBe(false)
    expect(canSmash('2026-07-05', { today: T })).toBe(false)
  })
  it('补录模式下历史可敲', () => {
    expect(canSmash('2026-06-25', { today: T, backfill: true })).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/rules.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/lib/rules.js`**

```js
// 编辑规则：过去的看、今天的敲、将来的摆（设计文档第 4 节）
import { todayStr, addDays } from './dates'

export function canPlace(date, { today = todayStr(), backfill = false } = {}) {
  if (backfill) return true
  return date >= today // 未来上限由周导航钳制，这里不重复判断
}

export function canSmash(date, { today = todayStr(), backfill = false } = {}) {
  if (backfill) return true
  return date === today || date === addDays(today, -1)
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/rules.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/rules.js src/lib/rules.test.js
git commit -m "feat: 按日期的编辑规则（今天敲/昨天补敲/未来摆/补录全开）"
```

---

### Task 3: 存档 v2 与 v1 迁移

**Files:**
- Modify: `src/lib/storage.js`（整文件替换为下方内容）
- Test: `src/lib/storage.test.js`

- [ ] **Step 1: 写失败测试 `src/lib/storage.test.js`**

```js
import { describe, it, expect } from 'vitest'
import { migrate } from './storage'

const T = '2026-07-04' // 周六，本周一为 2026-06-29

const v1 = {
  version: 1,
  week: [
    { morning: [{ id: 'a', icon: '📖', label: '读书', tex: 'stone' }], afternoon: [], evening: [] },
    { morning: [], afternoon: [], evening: [] },
    { morning: [], afternoon: [], evening: [] },
    { morning: [], afternoon: [], evening: [] },
    { morning: [], afternoon: [], evening: [] },
    { morning: [], afternoon: [{ id: 'b', icon: '⚽', label: '运动', tex: 'grass' }], evening: [] },
    { morning: [], afternoon: [], evening: [] },
  ],
  customs: [{ pid: 'c1', icon: '🎮', label: '游戏', tex: 'grass' }],
  materials: { stone: 2, grass: 1, wood: 0 },
  totalEver: 3,
  updatedAt: 123,
}

describe('migrate', () => {
  it('v1 的周数组落到迁移执行时的当前周日期，空天不建 key', () => {
    const out = migrate(v1, T)
    expect(out.version).toBe(2)
    expect(out.days['2026-06-29'].morning[0].label).toBe('读书')
    expect(out.days['2026-07-04'].afternoon[0].label).toBe('运动')
    expect(out.days['2026-06-30']).toBeUndefined()
    expect(Object.keys(out.days)).toHaveLength(2)
  })
  it('材料/进度/自定义方块保留', () => {
    const out = migrate(v1, T)
    expect(out.materials).toEqual({ stone: 2, grass: 1, wood: 0 })
    expect(out.totalEver).toBe(3)
    expect(out.customs).toHaveLength(1)
  })
  it('v2 原样返回；空输入返回 null', () => {
    const v2 = { version: 2, days: {}, customs: [], materials: { stone: 0, grass: 0, wood: 0 }, totalEver: 0, updatedAt: 1 }
    expect(migrate(v2, T)).toBe(v2)
    expect(migrate(null, T)).toBeNull()
    expect(migrate({ garbage: true }, T)).toBeNull()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/storage.test.js`
Expected: FAIL（migrate 未导出）

- [ ] **Step 3: 整文件替换 `src/lib/storage.js`**

```js
// 本地存档：localStorage 单机版（持久化方案第一步，云端 Supabase 后续接入）
// v2 起数据按天存储（days map），v1（单周数组）自动迁移
import { mondayOf, weekDates, todayStr } from './dates'

const LS_KEY = 'dayscraft_state_v1' // key 沿用，靠 version 字段区分版本

export function migrate(raw, today = todayStr()) {
  if (!raw) return null
  if (raw.version === 2) return raw
  if (raw.version === 1 && Array.isArray(raw.week)) {
    const dates = weekDates(mondayOf(today))
    const days = {}
    raw.week.forEach((day, i) => {
      if (day.morning.length || day.afternoon.length || day.evening.length) days[dates[i]] = day
    })
    return {
      version: 2,
      days,
      customs: raw.customs ?? [],
      materials: raw.materials ?? { stone: 0, grass: 0, wood: 0 },
      totalEver: raw.totalEver ?? 0,
      updatedAt: Date.now(),
    }
  }
  return null
}

export function loadLocal() {
  try {
    return migrate(JSON.parse(localStorage.getItem(LS_KEY)))
  } catch {
    return null
  }
}

export function saveLocal(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  } catch {
    /* 存储满或隐私模式，静默降级为内存态 */
  }
}
```

- [ ] **Step 4: 运行确认全部测试通过**

Run: `npm test`
Expected: PASS（dates + rules + storage 三个文件）

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.js src/lib/storage.test.js
git commit -m "feat: 存档 v2（按天存储）与 v1 自动迁移"
```

---

### Task 4: App 状态改为 days map + 格子 date 化

本任务只换数据底座，行为与现在等价（还看不到翻页/日期表头，Task 6 加）。改完后应用必须能跑：本周数据正常显示、拖拽/点按/敲碎照旧。

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: 导入与顶层状态替换**

`import` 区加：

```js
import { todayStr, addDays, mondayOf, weekDates, dowIdx, maxMonday, fmtMD, fmtShort, EPOCH_MONDAY } from "./lib/dates";
import { canPlace, canSmash } from "./lib/rules";
```

App 组件内，删除 `const todayIdx = ...`、`const [week, setWeek] = ...`、`const [dayIdx, setDayIdx] = ...`、`const dayIdxRef = ...`、`const weekRef = ...`，替换为：

```js
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
const [anchorMonday, setAnchorMonday] = useState(thisMonday); // 周视图当前显示的周
const [dayDate, setDayDate] = useState(today);                 // 日视图当前显示的天
const daysRef = useRef(days); daysRef.current = days;
```

`emptyDay` 保留。新增取某天数据的辅助（App 内、状态之后）：

```js
const dayOf = (date) => days[date] ?? emptyDay();
const setDay = (date, updater) => setDays((ds) => ({ ...ds, [date]: updater(ds[date] ?? emptyDay()) }));
```

- [ ] **Step 2: 存档 effect 改字段**

```js
useEffect(() => {
  saveLocal({ version: 2, days, customs, materials, totalEver, updatedAt: Date.now() });
}, [days, customs, materials, totalEver]);
```

- [ ] **Step 3: placeBlock / removeBlock / smash 改为按日期操作**

整体替换这三个函数：

```js
const placeBlock = useCallback((src, block, dDate, dBand) => {
  setDays((ds) => {
    const get = (date) => ds[date] ?? emptyDay();
    if (src.kind === "cell" && src.date === dDate && src.band === dBand) return ds; // 原地不动
    const target = get(dDate);
    if (target[dBand].length >= CAP) {
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
```

`smash` 中，最后的 `setWeek(...)` 删除方块改为标记完成（其余粒子/材料/音效逻辑不动）：

```js
setDay(src.date, (d) => ({
  ...d,
  [src.band]: d[src.band].map((b) => b.id === block.id ? { ...b, done: true, doneAt: Date.now() } : b),
}));
```

注意：placeBlock 里同一 band 移动时 `nds[src.date]` 先删再加要作用在同一对象上——上面代码先写 src 再以 `nds[dDate] ?? emptyDay()` 为基底追加，src.date === dDate 时基底已是删除后的版本，正确。

- [ ] **Step 4: data-cell 与命中检测 date 化**

`findCellAt` 中 `return { day: +d, band: b }` 改为：

```js
const [date, band] = el.getAttribute("data-cell").split("|");
return { date, band };
```

所有 `data-cell={`${...}|${band.key}`}` 处：周视图行传日期字符串（Task 6 一并改 FragmentRow），日视图处改为 `data-cell={`${dayDate}|${band.key}`}`。所有 `drag.hover.day === dayIdx` 之类比较改为 `drag.hover.date === dayDate`。

- [ ] **Step 5: 手势/视图中 dayIdx → dayDate**

- 长按敲碎入口、点按百宝箱落块：`dayIdxRef.current` → `dayDate`（直接读 state 的 ref：新增 `const dayDateRef = useRef(dayDate); dayDateRef.current = dayDate;` 并在手势里用 `dayDateRef.current`），`weekRef.current[day]` → `daysRef.current[dayDateRef.current] ?? emptyDay()`
- `src={{ kind: "cell", day: dayIdx, band: band.key }}` → `src={{ kind: "cell", date: dayDate, band: band.key }}`
- 日视图 `const day = week[dayIdx]` → `const day = dayOf(dayDate)`
- 「☀️ 今日」按钮 `setDayIdx(todayIdx)` → `setDayDate(today)`
- 周视图表头点日期进入那天：`setDayIdx(i)` → `setDayDate(weekDates(anchorMonday)[i])`
- 日视图标题 `{DAY_NAMES[dayIdx]}{dayIdx === todayIdx ? "（今天）" : ""}` → `{fmtMD(dayDate)} {DAY_NAMES[dowIdx(dayDate)]}{dayDate === today ? "（今天）" : ""}`
- FragmentRow / DetailModal 相应把 `src.day`（数字）换成 `src.date`（字符串），DetailModal 中 `DAY_NAMES[src.day]` → `${fmtMD(src.date)} ${DAY_NAMES[dowIdx(src.date)]}`
- FragmentRow 的 props 从 `week` 改为 `dates`（7 个日期字符串）与 `days`（map），内部 `week.map((d, di))` → `dates.map((date) => { const d = days[date] ?? emptyDay(); ... })`，`data-cell` 用 `${date}|${band.key}`，今天高亮条件 `di === todayIdx` → `date === today`（today 作为 prop 传入）

- [ ] **Step 6: 手动验证（preview）**

启动 dev 服务（launch.json 配置名 `dayscraft`），确认：本周方块显示如常、拖拽换格、点按落块、长按敲碎后**方块保留并进入 done 形态尚未有样式（下个任务加），但不再消失、材料照常增加**、刷新后数据仍在且 localStorage 里是 `version: 2` + `days` 结构。

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "refactor: 状态底座改为按天存储的 days map，格子与手势 date 化"
```

---

### Task 5: 已完成（done）方块的形态与行为

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Block 组件渲染 done 形态**

`Block` 组件内加 `const isDone = !!block.done;`，根 div 的 style 调整/追加：

```js
opacity: dim ? 0.25 : isDone ? 0.45 : 1,
cursor: isDone ? "default" : "grab",
```

并在 `{charging && <Cracks stage={charge.stage} />}` 旁追加：

```jsx
{isDone && <Cracks stage={3} />}
{isDone && (
  <span style={{
    position: "absolute", top: -8, right: -8, width: 20, height: 20,
    background: "#6dbb45", border: "2px solid #fff", color: "#fff",
    fontSize: 13, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center",
    pointerEvents: "none",
  }}>✔</span>
)}
```

- [ ] **Step 2: done 方块惰性化（不可拖、不可敲，周视图仍可点详情）**

`onBlockDown` 开头（`ensureAudio()` 之后）：

```js
const isDone = src.kind === "cell" && !!block.done;
```

- 蓄力条件增加 `!isDone`：`if (src.kind === "cell" && viewRef.current === "day" && !isDone) { ... }`
- `move` 中进入 drag 的条件增加：`if (gg.mode === "pending" && !(gg.src.kind === "cell" && gg.block.done) && Math.hypot(...) > 8)`
- 周视图点按详情逻辑不变（done 也能看详情）

- [ ] **Step 3: DetailModal 支持 done**

`DetailModal` 中，「移回百宝箱」按钮仅在未完成时显示；done 时以文本替代：

```jsx
{block.done ? (
  <div style={{ flex: 1, padding: 10, fontWeight: 900, fontSize: 13, textAlign: "center", color: "#3a3a3a", background: "#b8e6a3", ...bevel(false) }}>✔ 已完成</div>
) : (
  <button onClick={onRemove} style={{ /* 原样 */ }}>🧰 移回百宝箱</button>
)}
```

- [ ] **Step 4: 手动验证（preview）**

日视图敲碎一块 → 方块变半透明+满裂纹+绿✔、留在原格；再长按无蓄力；拖不动；周视图点它出详情显示「已完成」；刷新后 done 状态仍在。

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: 敲碎改为标记完成，done 方块保留并惰性化"
```

---

### Task 6: 编辑规则接线 + 周/日导航 UI

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: 增加补录状态占位（本任务先恒 false，Task 7 实装）**

```js
const [backfill, setBackfill] = useState(false);
const ruleOpts = { today, backfill };
```

- [ ] **Step 2: 手势接线编辑规则**

- **蓄力入口**：条件再加 `canSmash(src.date, ruleOpts)`（与 `!isDone` 并列）。注意手势闭包里用到的 `backfill` 需要 ref：`const backfillRef = useRef(backfill); backfillRef.current = backfill;`，闭包内构造 `{ today, backfill: backfillRef.current }`
- **拖起限制**：`move` 进入 drag 的条件对 cell 源再加 `canPlace(gg.src.date, { today, backfill: backfillRef.current })`（过去的方块拖不动）
- **落块限制**：`up` 中命中 cell 后、黑夜判断之前：

```js
if (!canPlace(cell.date, { today, backfill: backfillRef.current })) {
  showToast(cell.date < today ? "过去的日子不能改啦" : "还没到这一天呢");
} else if (cell.band === "night") { /* 原怪物逻辑 */ } else { placeBlock(...) }
```

（`cell.date < today` 为字符串比较，规则模块已保证格式统一）

- **点按落块**（日视图点百宝箱方块）：先判 `canPlace(dayDateRef.current, ...)`，不允许时 toast「过去的日子不能改啦」
- **移回百宝箱**：拖回箱子的分支天然被「拖起限制」挡住，无需额外判断

- [ ] **Step 3: 周翻页器 + 表头日期**

视图切换行（`{view === "week" && (...)}` 提示文字之前）加翻页器：

```jsx
{view === "week" && (
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <PixBtn onClick={() => setAnchorMonday((m) => (m > EPOCH_MONDAY ? addDays(m, -7) : m))}
      style={{ opacity: anchorMonday > EPOCH_MONDAY ? 1 : 0.35 }}>‹</PixBtn>
    <span style={{ fontWeight: 900, fontSize: 13, color: "#fff", textShadow: "1px 1px 0 #3a3a3a", minWidth: 150, textAlign: "center" }}>
      {fmtMD(anchorMonday)} – {fmtMD(addDays(anchorMonday, 6))}
    </span>
    <PixBtn onClick={() => setAnchorMonday((m) => (m < maxMonday() ? addDays(m, 7) : m))}
      style={{ opacity: anchorMonday < maxMonday() ? 1 : 0.35 }}>›</PixBtn>
  </div>
)}
```

周视图渲染前取 `const dates = weekDates(anchorMonday);`，表头改为：

```jsx
{dates.map((date, i) => (
  <button key={date} onClick={() => { setDayDate(date); setView("day"); sndPlace(); }} style={{
    border: "2px solid rgba(0,0,0,0.25)",
    background: date === today ? "#ffe66d" : date < today ? "rgba(200,200,200,0.55)" : "rgba(255,255,255,0.75)",
    fontWeight: 900, fontSize: 12, padding: "8px 2px", cursor: "pointer", fontFamily: "inherit", color: "#3a3a3a",
  }}>
    {date === today ? "☀️ " : ""}{DAY_NAMES[i]} {fmtShort(date)}
  </button>
))}
```

FragmentRow 传 `dates={dates} days={days} today={today}`；过去的天列格子背景在原基础上调暗：`background: date === today ? "rgba(255,230,109,0.30)" : date < today ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.12)"`。

- [ ] **Step 4: 日视图按天切换**

日视图标题区替换为（含钳制，范围 [EPOCH_MONDAY, maxMonday()+6天]）：

```jsx
{view === "day" && (
  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <PixBtn onClick={() => setDayDate((d) => (d > EPOCH_MONDAY ? addDays(d, -1) : d))}
      style={{ opacity: dayDate > EPOCH_MONDAY ? 1 : 0.35 }}>‹</PixBtn>
    <span style={{ fontWeight: 900, fontSize: 14, color: "#fff", textShadow: "1px 1px 0 #3a3a3a" }}>
      {fmtMD(dayDate)} {DAY_NAMES[dowIdx(dayDate)]}{dayDate === today ? "（今天）" : ""}
    </span>
    <PixBtn onClick={() => setDayDate((d) => (d < addDays(maxMonday(), 6) ? addDays(d, 1) : d))}
      style={{ opacity: dayDate < addDays(maxMonday(), 6) ? 1 : 0.35 }}>›</PixBtn>
    {canSmash(dayDate, ruleOpts) && (
      <span style={{ fontWeight: 900, fontSize: 13, color: "#fff", textShadow: "1px 1px 0 #3a3a3a", marginLeft: 6 }}>
        做完一件，按住方块敲碎它！🔨
      </span>
    )}
  </div>
)}
```

切日时同步周视图锚点无必要（各自独立），但「去这一天」（DetailModal onGoto）需要 `setDayDate(detail.src.date)`。

- [ ] **Step 5: 手动验证（preview）**

- 周翻页：‹ 到 6/22 那周后变灰；› 到下周后变灰；表头日期正确（6/29–7/5 跨月显示 7/1）
- 过去列变暗；拖块到昨天 → toast「过去的日子不能改啦」；拖到下周格子成功
- 日视图 ‹ › 逐天走，边界变灰；昨天（7/3）里放一个未完成方块（先用今天摆好再等不了——直接翻到昨天长按已有方块验证补敲提示条与蓄力可用）；前天方块长按无反应
- 「☀️ 今日」仍一键回今天

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: 编辑规则接线与周/日导航（真实日期、范围钳制、历史只读）"
```

---

### Task 7: 补录模式

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: 连点标题 5 次开启 + 横幅**

标题连点计数（1.5s 内累计）：

```js
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
```

h1 加 `onClick={onTitleTap}`（并加 `cursor: "default", userSelect: "none"`）。HUD 行下方渲染横幅：

```jsx
{backfill && (
  <button onClick={() => { setBackfill(false); showToast("补录模式已关闭"); }} style={{
    ...bevel(true), background: "#e8912d", color: "#fff", textShadow: "1px 1px 0 #3a3a3a",
    fontWeight: 900, fontSize: 13, padding: "8px 12px", margin: "0 14px 8px",
    cursor: "pointer", fontFamily: "inherit", textAlign: "center",
  }}>🔧 补录模式 — 历史日子已解锁，点这里关闭</button>
)}
```

- [ ] **Step 2: 确认权限打通**

Task 6 已把 `backfill` 注入 `canPlace/canSmash`（含手势 ref），本步只需检查：蓄力入口、拖起、落块、点按落块四处全部走 `backfillRef.current`。补录状态不持久化（不在存档 effect 里）——已满足，确认即可。

- [ ] **Step 3: 手动验证（preview）**

- 连点标题 5 次 → 横幅出现；翻到 6/22 那周，拖块进 6/24、长按敲碎成功、材料增加
- 点横幅关闭 → 历史恢复只读
- 刷新 → 补录模式自动退出
- done 方块在补录模式下仍不可改

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: 补录模式（连点标题5次，历史临时可编辑）"
```

---

### Task 8: 迁移实测 + 整体验收 + 文档收尾

**Files:**
- Modify: `README.md`（DaysCraft 内）

- [ ] **Step 1: v1 迁移实测**

preview 控制台注入一份 v1 存档并刷新：

```js
localStorage.setItem('dayscraft_state_v1', JSON.stringify({
  version: 1,
  week: [ {morning:[{id:'x1',icon:'📖',label:'读书',tex:'stone'}],afternoon:[],evening:[]},
    {morning:[],afternoon:[],evening:[]},{morning:[],afternoon:[],evening:[]},
    {morning:[],afternoon:[],evening:[]},{morning:[],afternoon:[],evening:[]},
    {morning:[],afternoon:[{id:'x2',icon:'⚽',label:'运动',tex:'grass'}],evening:[]},
    {morning:[],afternoon:[],evening:[]} ],
  customs: [], materials: {stone:1,grass:0,wood:0}, totalEver: 1, updatedAt: 1,
})); location.reload()
```

Expected: 周视图本周的周一有「读书」、周六有「运动」，材料石头=1；localStorage 变为 version 2。

- [ ] **Step 2: 全量测试 + 构建**

```bash
npm test && npm run build
```

Expected: 测试全过，构建成功。

- [ ] **Step 3: 验收清单（preview 走查）**

- [ ] 打开落在今天；周视图表头带日期、今天高亮、过去变暗
- [ ] 周范围 6/22那周 ↔ 下周，两端箭头置灰
- [ ] 敲碎留 done 形态，刷新仍在；材料/小世界照常
- [ ] 昨天可补敲、前天只读、未来只摆不敲，各有正确 toast
- [ ] 补录模式全流程
- [ ] 手机宽度（preview_resize mobile）下翻页器与表头不溢出

- [ ] **Step 4: 更新 README 玩法说明**

README「核心玩法」中补两条：

```markdown
- **真实日历**：周视图挂真实日期（最早 2026-06-22 那周，最远下周），可逐周翻页回看历史；过去的看、今天的敲、将来的摆，昨天做完忘敲的可以补敲
- **补录模式**：连点标题 5 次开启，家长可补录历史日子的活动（刷新自动退出）
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: README 补充多周日程与补录模式说明"
```

---

## 自查记录

- **Spec 覆盖**：设计文档 §2 数据模型→Task 3/4；§2.1 迁移→Task 3 + Task 8 实测；§3 敲碎保留→Task 4 Step 3 + Task 5；§4 编辑规则→Task 2 + Task 6；§5 导航→Task 6；§6 补录→Task 7；§7 边界（跨周昨天、跨月周）→Task 1/2 测试用例；§5「移除睡着方块」→ 无需动作（demo 从未实现该机制）
- **类型一致性**：`src` 统一为 `{kind:'box'}` 或 `{kind:'cell', date, band}`；`days` map 各任务签名一致；`ruleOpts = { today, backfill }` 与 rules.js 签名一致
- **无占位符**：所有代码步骤均给出完整代码或精确修改点
