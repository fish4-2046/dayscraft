import { describe, expect, it } from 'vitest'
import { deleteTaskTemplate, initialTaskTemplates, updateTaskTemplate } from './templates'

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
