import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readAppIconLibrary() {
  const appSource = readFileSync(resolve(__dirname, '../App.jsx'), 'utf8')
  const match = appSource.match(/const ICON_LIB = \[(?<icons>[\s\S]*?)\];/)
  return match?.groups?.icons ?? ''
}

describe('ICON_LIB', () => {
  it('includes a yellow chick option for JiaoJiao reading tasks', () => {
    expect(readAppIconLibrary()).toContain('"🐥"')
  })

  it('uses a 123 icon for math instead of the abacus icon', () => {
    const iconLibrary = readAppIconLibrary()

    expect(iconLibrary).toContain('"🔢"')
    expect(iconLibrary).not.toContain('"🧮"')
  })

  it('includes every default task icon as selectable options', () => {
    const iconLibrary = readAppIconLibrary()

    for (const icon of ['"✏️"', '"📖"', '"🎹"', '"⚽"', '"🎨"', '"📺"', '"🐟"', '"🧸"']) {
      expect(iconLibrary).toContain(icon)
    }
  })
})

describe('material names', () => {
  it('labels wood as a life material instead of chores', () => {
    const appSource = readFileSync(resolve(__dirname, '../App.jsx'), 'utf8')

    expect(appSource).toContain('wood: "生活·木头"')
    expect(appSource).not.toContain('wood: "家务·木头"')
  })
})
