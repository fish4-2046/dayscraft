import { describe, expect, it } from 'vitest'
import {
  deleteTaskTemplate,
  displayTaskLabel,
  initialTaskTemplates,
  limitTaskLabelInput,
  reorderTaskTemplate,
  updateTaskTemplate,
} from './templates'

const defaults = [
  { pid: 'hw', label: '写作业', tex: 'stone' },
  { pid: 'read', label: '读书', tex: 'stone' },
]

describe('initialTaskTemplates', () => {
  it('新存档优先使用可编辑的任务模板列表', () => {
    const saved = { templates: [{ pid: 'hw', label: '数学', tex: 'stone' }] }

    expect(initialTaskTemplates(defaults, saved)).toEqual(saved.templates)
  })

  it('兼容旧存档：隐藏默认任务并合并自定义任务', () => {
    const saved = {
      hiddenDefaultIds: ['read'],
      customs: [{ pid: 'c1', label: '语文', tex: 'stone' }],
    }

    expect(initialTaskTemplates(defaults, saved).map((block) => block.pid)).toEqual(['hw', 'c1'])
  })
})

describe('updateTaskTemplate', () => {
  it('默认任务和自定义任务都可以按 pid 更新', () => {
    expect(updateTaskTemplate(defaults, { pid: 'hw', label: '数学', tex: 'stone' })).toEqual([
      { pid: 'hw', label: '数学', tex: 'stone' },
      { pid: 'read', label: '读书', tex: 'stone' },
    ])
  })
})

describe('deleteTaskTemplate', () => {
  it('默认任务和自定义任务都可以按 pid 删除', () => {
    expect(deleteTaskTemplate(defaults, 'read')).toEqual([
      { pid: 'hw', label: '写作业', tex: 'stone' },
    ])
  })
})

describe('limitTaskLabelInput', () => {
  it('任务名称最多保留 48 个字符', () => {
    expect(limitTaskLabelInput('一'.repeat(50))).toBe('一'.repeat(48))
  })
})

describe('displayTaskLabel', () => {
  it('日程和百宝箱里超过 4 个字显示省略号', () => {
    expect(displayTaskLabel('写作业')).toBe('写作业')
    expect(displayTaskLabel('一二三四')).toBe('一二三四')
    expect(displayTaskLabel('一二三四五')).toBe('一二三四...')
  })
})

describe('reorderTaskTemplate', () => {
  it('按 pid 调整任务模板顺序', () => {
    expect(reorderTaskTemplate(defaults, 'read', 'hw').map((block) => block.pid)).toEqual(['read', 'hw'])
  })

  it('拖到自己或不存在的模板上时保持原顺序', () => {
    expect(reorderTaskTemplate(defaults, 'read', 'read')).toBe(defaults)
    expect(reorderTaskTemplate(defaults, 'read', 'missing')).toBe(defaults)
  })

  it('移动到后面的模板前时保持插入位置准确', () => {
    const templates = [
      { pid: 'homework' },
      { pid: 'reading' },
      { pid: 'piano' },
      { pid: 'sport' },
    ]

    expect(reorderTaskTemplate(templates, 'reading', 'sport').map((block) => block.pid)).toEqual([
      'homework',
      'piano',
      'reading',
      'sport',
    ])
  })

  it('beforePid 为空时移动到末尾', () => {
    expect(reorderTaskTemplate(defaults, 'hw', null).map((block) => block.pid)).toEqual(['read', 'hw'])
  })
})
