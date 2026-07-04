// 本地存档：localStorage 单机版（持久化方案第一步，云端 Supabase 后续接入）
const LS_KEY = 'dayscraft_state_v1'

export function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY))
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
