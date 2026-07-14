import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const SOURCE_URL = 'https://barcon.it/tradizioni-venete/dizionario/'
const SOURCE_NAME = 'Dizionario veneto-italiano Barcon'
const CATEGORY = 'Dizionario veneto-italiano Barcon'
const OUTPUT_DIR = path.resolve(process.cwd(), 'data', 'wiktionary', 'veneto')
const LENGTHS_DIR = path.join(OUTPUT_DIR, 'lengths')
const segmenter = new Intl.Segmenter('it', { granularity: 'grapheme' })

function decodeHtml(value) {
  const namedEntities = {
    amp: '&',
    apos: "'",
    laquo: '«',
    lsquo: '‘',
    nbsp: ' ',
    quot: '"',
    raquo: '»',
    rsquo: '’',
  }

  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (entity, code) => {
    const normalizedCode = code.toLocaleLowerCase('en')
    if (normalizedCode.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(normalizedCode.slice(2), 16))
    }
    if (normalizedCode.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(normalizedCode.slice(1), 10))
    }
    return namedEntities[normalizedCode] ?? entity
  })
}

function textFromHtml(value) {
  return decodeHtml(value)
    .replace(/<br\s*\/?>/giu, ' ')
    .replace(/<[^>]+>/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function normalizeWord(value) {
  return value.replace(/['`´’]/g, '’').normalize('NFC').trim().toLocaleLowerCase('it')
}

function getLetters(word) {
  return [...segmenter.segment(word.normalize('NFC'))].map((part) => part.segment)
}

function isWordLike(word) {
  return getLetters(word).every((letter) => /\p{L}/u.test(letter) || letter === '’')
}

function cleanDefinition(value) {
  return value.replace(/\s*[-–]\s*/gu, ' - ').replace(/\s+/gu, ' ').trim().replace(/\.$/u, '')
}

function extractHeadwords(value) {
  return value
    .replace(/[“”"]/gu, '')
    .replace(/\([^)]*\)/gu, '')
    .split(',')
    .map((part) => normalizeWord(part))
    .filter((word) => word && !word.includes(' ') && !word.includes('-') && isWordLike(word))
}

function extractBarconEntries(html) {
  const entriesByWord = new Map()
  const itemPattern = /<li>([\s\S]*?)<\/li>/giu

  for (const match of html.matchAll(itemPattern)) {
    const text = textFromHtml(match[1])
    const separatorIndex = text.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }

    const headwords = extractHeadwords(text.slice(0, separatorIndex))
    const definition = cleanDefinition(text.slice(separatorIndex + 1))
    if (!definition) {
      continue
    }

    for (const word of headwords) {
      if (!entriesByWord.has(word)) {
        entriesByWord.set(word, {
          word,
          length: getLetters(word).length,
          categories: [CATEGORY],
          sources: [SOURCE_NAME],
          sourceUrls: [SOURCE_URL],
          titles: [word],
          definition,
        })
      }
    }
  }

  return [...entriesByWord.values()]
}

function mergeEntries(existingEntries, sourceEntries) {
  const mergedByWord = new Map(existingEntries.map((entry) => [normalizeWord(entry.word), entry]))
  const added = []

  for (const entry of sourceEntries) {
    if (mergedByWord.has(entry.word)) {
      continue
    }

    mergedByWord.set(entry.word, entry)
    added.push(entry)
  }

  return {
    added,
    entries: [...mergedByWord.values()].sort((left, right) => {
      if (left.length !== right.length) {
        return left.length - right.length
      }
      return left.word.localeCompare(right.word, 'it')
    }),
  }
}

function groupByLength(entries) {
  const byLength = {}

  for (const entry of entries) {
    const key = String(entry.length)
    byLength[key] ??= []
    byLength[key].push(entry.word)
  }

  return byLength
}

async function writeFiles(entries, sourceEntries, added) {
  const metadataPath = path.join(OUTPUT_DIR, 'metadata.json')
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
  const grouped = groupByLength(entries)
  const sourceMetadata = {
    name: SOURCE_NAME,
    url: SOURCE_URL,
    totalParsedWords: sourceEntries.length,
    totalAddedWords: added.length,
  }

  metadata.totalUniqueWords = entries.length
  metadata.barconSource = sourceMetadata
  metadata.extraSources = [
    ...(metadata.extraSources ?? []).filter((source) => source.url !== SOURCE_URL),
    sourceMetadata,
  ]

  await mkdir(LENGTHS_DIR, { recursive: true })
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2))
  await writeFile(path.join(OUTPUT_DIR, 'all-words.json'), JSON.stringify(entries, null, 2))
  await writeFile(path.join(OUTPUT_DIR, 'by-length.json'), JSON.stringify(grouped, null, 2))

  for (const file of await readdir(LENGTHS_DIR)) {
    if (file.endsWith('.json')) {
      await rm(path.join(LENGTHS_DIR, file))
    }
  }

  for (const [length, words] of Object.entries(grouped)) {
    await writeFile(path.join(LENGTHS_DIR, `${length}.json`), JSON.stringify(words, null, 2))
  }
}

async function main() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      'user-agent': 'paroli-word-importer/0.1 (+https://github.com/SimoneErba/dialettile)',
    },
  })
  if (!response.ok) {
    throw new Error(`Request failed for "${SOURCE_URL}": ${response.status} ${response.statusText}`)
  }

  const html = await response.text()
  const sourceEntries = extractBarconEntries(html)
  const existingEntries = JSON.parse(await readFile(path.join(OUTPUT_DIR, 'all-words.json'), 'utf8'))
  const { added, entries } = mergeEntries(existingEntries, sourceEntries)
  await writeFiles(entries, sourceEntries, added)

  const addedByLength = Object.entries(groupByLength(added))
    .map(([length, words]) => `${length}:${words.length}`)
    .join(', ')

  console.log(
    `Barcon Veneto: ${sourceEntries.length} parole parsate, ${added.length} nuove aggiunte (${addedByLength || 'nessuna'})`,
  )
}

await main()
