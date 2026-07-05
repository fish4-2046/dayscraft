# 方块时间 DaysCraft

给 6–8 岁小朋友的「搭建我的一周」网页小游戏：用像素方块摆出这周要做的事，做完一件就长按抡锤敲碎一块，碎出的材料让属于自己的小世界一天天长大。

## 核心玩法

- **一周规划（默认视图）**：7 天 × 4 时段（上午/下午/晚上/黑夜）的规划表，和爸妈一起把方块从百宝箱拖进格子；黑夜是睡觉禁区，有怪物出没
- **今日视图**：孩子执行的一天，做完一件事就长按方块蓄力敲碎，掉落材料
- **我的世界**：敲碎的材料自动汇入，小世界按线性成长序列长大（空地 → 树苗 → 篱笆 → 小屋 → 花园 → 小狗安家）
- **方块工坊**：孩子自己挑图标 + 选材质创建新方块（学习=石头、玩耍=草块、家务=木头）
- **真实日历**：周视图挂真实日期（最早 2026-06-22 那周，最远下周），可逐周翻页回看历史；过去的看、今天的敲、将来的摆，昨天做完忘敲的可以补敲；敲碎的方块保留为半透明 ✔ 形态留痕
- **补录模式**：连点标题 5 次开启，家长可补录历史日子的活动（刷新自动退出）

## 技术栈

- React 19 + Vite
- 原生 Pointer 事件手势（点按 / 拖拽 / 长按敲碎，移动 8px 阈值区分）
- Web Audio 合成音效，SVG 程序化像素纹理
- localStorage 本地存档，按天存储（v2，`src/lib/storage.js` 含 v1 自动迁移）；登录后通过 Supabase `app_state` 表云端同步
- 纯逻辑模块（日期 `dates.js` / 编辑规则 `rules.js` / 存档迁移）有 Vitest 覆盖：`npm test`

## 开发

线上地址：https://dayscraft.vercel.app/

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 产物在 dist/
```

本地云端同步需要复制 `.env.example` 为 `.env.local`，填入：

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_AUTH_REDIRECT_URL=https://dayscraft.vercel.app
```

线上部署时，在 Vercel 项目环境变量里填同样三项；`VITE_AUTH_REDIRECT_URL` 用来确保 Supabase 邮件登录后回到正式站点，而不是本地开发地址。

## 项目资料

产品设计、路线图、实施计划等本地项目资料不随公开仓库发布。
