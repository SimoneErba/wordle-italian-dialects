import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { gunzipSync } from 'node:zlib'

const IT_WIKTIONARY_API = 'https://it.wiktionary.org/w/api.php'
const VEC_WIKTIONARY_API = 'https://vec.wiktionary.org/w/api.php'
const VEC_WIKTIONARY_DUMP_ROOT = 'https://dumps.wikimedia.org/vecwiktionary/latest'
const LMO_WIKTIONARY_DUMP_ROOT = 'https://dumps.wikimedia.org/lmowiktionary/latest'
const SCN_WIKTIONARY_DUMP_ROOT = 'https://dumps.wikimedia.org/scnwiktionary/latest'
const CO_WIKTIONARY_DUMP_ROOT = 'https://dumps.wikimedia.org/cowiktionary/latest'
const OUTPUT_ROOT = path.resolve(process.cwd(), 'data', 'wiktionary')
const segmenter = new Intl.Segmenter('it', { granularity: 'grapheme' })
const REQUEST_DELAY_MS = 1200
const MAX_RETRIES = 4

const dialectCatalog = {
  napoletano: {
    name: 'Napoletano',
    categories: ['Sostantivi in napoletano', 'Verbi in napoletano', 'Aggettivi in napoletano'],
  },
  siciliano: {
    name: 'Siciliano',
    categories: ['Sostantivi in siciliano', 'Verbi in siciliano', 'Aggettivi in siciliano'],
    dumpSources: [
      {
        name: 'Wikizionario siciliano',
        root: SCN_WIKTIONARY_DUMP_ROOT,
        dumpPrefix: 'scnwiktionary',
        categoryKeys: ['sustantivi siciliani', 'verbi siciliani', 'aggittivi siciliani'],
      },
    ],
  },
  veneto: {
    name: 'Veneto',
    categories: ['Sostantivi in veneto', 'Verbi in veneto', 'Aggettivi in veneto'],
    apiSources: [
      {
        name: 'Wikizionario veneto',
        api: VEC_WIKTIONARY_API,
        categories: ['Nòmi in vèneto', 'Verbi in vèneto', 'Ajetivi in vèneto'],
      },
    ],
  },
  lombardo: {
    name: 'Lombardo',
    categories: ['Sostantivi in lombardo', 'Verbi in lombardo', 'Aggettivi in lombardo'],
    dumpSources: [
      {
        name: 'Wikizionario lombardo',
        root: LMO_WIKTIONARY_DUMP_ROOT,
        dumpPrefix: 'lmowiktionary',
        categoryKeys: ['nom in lombard', 'verb in lombard', 'agetiv in lombard'],
      },
    ],
  },
  corso: {
    name: 'Corso',
    categories: ['Sostantivi in corso', 'Verbi in corso', 'Aggettivi in corso'],
    dumpSources: [
      {
        name: 'Wikizionario corso',
        root: CO_WIKTIONARY_DUMP_ROOT,
        dumpPrefix: 'cowiktionary',
        categoryKeys: ['sustantivi corsi', 'verbi corsi', 'aghjettivi corsi'],
      },
    ],
  },
}

function normalizeWord(value) {
  return value.replace(/['`´’]/g, '’').normalize('NFC').trim().toLocaleLowerCase('it')
}

function normalizeCategoryKey(value) {
  return value
    .replace(/_/g, ' ')
    .replace(/[ƚł]/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('it')
}

function getLetters(word) {
  return [...segmenter.segment(word.normalize('NFC'))].map((part) => part.segment)
}

function isWordLike(word) {
  return getLetters(word).every((letter) => /\p{L}/u.test(letter) || letter === '’')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetries(url, responseKind) {
  let response
  let lastError

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    response = await fetch(url, {
      headers: {
        'user-agent': 'paroli-word-importer/0.1 (+https://github.com/SimoneErba/dialettile)',
      },
    }).catch((error) => {
      lastError = error
      return null
    })

    if (response?.ok) {
      if (responseKind === 'json') {
        return response.json()
      }

      return Buffer.from(await response.arrayBuffer())
    }

    const retryable = !response || response.status === 429 || response.status >= 500
    if (!retryable || attempt === MAX_RETRIES - 1) {
      if (response) {
        throw new Error(`Request failed for "${url}": ${response.status} ${response.statusText}`)
      }

      throw lastError
    }

    await sleep(REQUEST_DELAY_MS * (attempt + 1))
  }

  throw new Error(`Request failed for "${url}"`)
}

async function fetchCategoryMembers(api, category) {
  const words = []
  let continueToken

  do {
    const params = new URLSearchParams({
      action: 'query',
      list: 'categorymembers',
      cmtitle: `Categoria:${category}`,
      cmnamespace: '0',
      cmlimit: 'max',
      format: 'json',
      formatversion: '2',
    })

    if (continueToken) {
      params.set('cmcontinue', continueToken)
    }

    const url = `${api}?${params}`
    const data = await fetchWithRetries(url, 'json')

    for (const member of data.query.categorymembers) {
      words.push(member.title)
    }

    continueToken = data.continue?.cmcontinue
    await sleep(REQUEST_DELAY_MS)
  } while (continueToken)

  return words
}

function splitSqlValues(values) {
  const rows = []
  let row = []
  let value = ''
  let inString = false
  let escaping = false
  let inRow = false

  for (const char of values) {
    if (!inRow) {
      if (char === '(') {
        inRow = true
        row = []
        value = ''
      }
      continue
    }

    if (escaping) {
      value += char
      escaping = false
      continue
    }

    if (char === '\\' && inString) {
      escaping = true
      continue
    }

    if (char === "'") {
      inString = !inString
      continue
    }

    if (!inString && char === ',') {
      row.push(value)
      value = ''
      continue
    }

    if (!inString && char === ')') {
      row.push(value)
      rows.push(row)
      inRow = false
      value = ''
      continue
    }

    value += char
  }

  return rows
}

function extractInsertRows(sql, tableName) {
  const rows = []
  const insertPattern = new RegExp(`INSERT INTO \`${tableName}\` VALUES ([\\s\\S]*?);`, 'g')

  for (const match of sql.matchAll(insertPattern)) {
    rows.push(...splitSqlValues(match[1]))
  }

  return rows
}

function extractPageRows(sql) {
  const rows = []
  const pattern = /\((\d+),(-?\d+),'((?:[^'\\]|\\.)*)',([01]),/g

  for (const match of sql.matchAll(pattern)) {
    rows.push({
      id: match[1],
      namespace: match[2],
      title: match[3].replace(/\\'/g, "'").replace(/\\\\/g, '\\'),
      isRedirect: match[4],
    })
  }

  return rows
}

function extractLinkTargetRows(sql) {
  const rows = []
  const pattern = /\((\d+),(-?\d+),'((?:[^'\\]|\\.)*)'\)/g

  for (const match of sql.matchAll(pattern)) {
    rows.push({
      id: match[1],
      namespace: match[2],
      title: match[3].replace(/\\'/g, "'").replace(/\\\\/g, '\\'),
    })
  }

  return rows
}

function extractCategoryLinkRows(sql) {
  const rows = []
  const pattern = /\((\d+),'(?:[^'\\]|\\.)*','(?:[^'\\]|\\.)*','[^']*','(page|subcat|file)',\d+,(\d+)\)/g

  for (const match of sql.matchAll(pattern)) {
    rows.push({
      pageId: match[1],
      type: match[2],
      targetId: match[3],
    })
  }

  return rows
}

async function fetchGzText(url) {
  const buffer = await fetchWithRetries(url, 'buffer')
  return gunzipSync(buffer).toString('utf8')
}

async function fetchWiktionaryDumpWords(source) {
  const dumpPrefix = source.dumpPrefix ?? 'vecwiktionary'
  const [pageSql, linkTargetSql, categoryLinksSql] = await Promise.all([
    fetchGzText(`${source.root}/${dumpPrefix}-latest-page.sql.gz`),
    fetchGzText(`${source.root}/${dumpPrefix}-latest-linktarget.sql.gz`),
    fetchGzText(`${source.root}/${dumpPrefix}-latest-categorylinks.sql.gz`),
  ])

  const pagesById = new Map()
  for (const row of extractPageRows(pageSql)) {
    if (row.namespace === '0' && row.isRedirect === '0') {
      pagesById.set(row.id, row.title.replace(/_/g, ' '))
    }
  }

  const targetIdsByCategory = new Map()
  const categoryKeys = new Set(source.categoryKeys)
  for (const row of extractLinkTargetRows(linkTargetSql)) {
    if (row.namespace === '14' && categoryKeys.has(normalizeCategoryKey(row.title))) {
      targetIdsByCategory.set(row.id, row.title)
    }
  }

  const words = []
  for (const row of extractCategoryLinkRows(categoryLinksSql)) {
    const category = targetIdsByCategory.get(row.targetId)
    const title = pagesById.get(row.pageId)

    if (row.type === 'page' && category && title) {
      words.push({
        category: category.replace(/_/g, ' '),
        source: source.name,
        sourceUrl: `${source.root}/${dumpPrefix}-latest-pages-meta-current.xml.bz2`,
        word: title,
      })
    }
  }

  return words
}

function buildEntries(rawWords) {
  const unique = new Map()

  for (const item of rawWords) {
    const normalized = normalizeWord(item.word)
    if (!normalized || !isWordLike(normalized)) {
      continue
    }

    const existing = unique.get(normalized)
    if (existing) {
      existing.categories = Array.from(new Set([...existing.categories, item.category]))
      existing.sources = Array.from(new Set([...existing.sources, item.source]))
      existing.sourceUrls = Array.from(new Set([...existing.sourceUrls, item.sourceUrl]))
      existing.titles = Array.from(new Set([...existing.titles, item.word]))
      continue
    }

    unique.set(normalized, {
      word: normalized,
      length: getLetters(normalized).length,
      categories: [item.category],
      sources: [item.source],
      sourceUrls: [item.sourceUrl],
      titles: [item.word],
    })
  }

  return [...unique.values()].sort((left, right) => {
    if (left.length !== right.length) {
      return left.length - right.length
    }
    return left.word.localeCompare(right.word, 'it')
  })
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

async function writeDialectFiles(dialectId, dialect, entries, rawWords) {
  const dialectDir = path.join(OUTPUT_ROOT, dialectId)
  const lengthsDir = path.join(dialectDir, 'lengths')
  const grouped = groupByLength(entries)

  await mkdir(lengthsDir, { recursive: true })

  const metadata = {
    dialectId,
    dialectName: dialect.name,
    downloadedAt: new Date().toISOString(),
    totalRawWords: rawWords.length,
    totalUniqueWords: entries.length,
    categories: dialect.categories,
    apiSources: dialect.apiSources ?? [],
    dumpSources: dialect.dumpSources ?? [],
  }

  await writeFile(path.join(dialectDir, 'metadata.json'), JSON.stringify(metadata, null, 2))
  await writeFile(path.join(dialectDir, 'all-words.json'), JSON.stringify(entries, null, 2))
  await writeFile(path.join(dialectDir, 'by-length.json'), JSON.stringify(grouped, null, 2))

  for (const [length, words] of Object.entries(grouped)) {
    await writeFile(path.join(lengthsDir, `${length}.json`), JSON.stringify(words, null, 2))
  }
}

async function downloadDialect(dialectId) {
  const dialect = dialectCatalog[dialectId]
  if (!dialect) {
    throw new Error(`Unsupported dialect "${dialectId}". Available: ${Object.keys(dialectCatalog).join(', ')}`)
  }

  const rawWords = []
  for (const category of dialect.categories) {
    const words = await fetchCategoryMembers(IT_WIKTIONARY_API, category)
    for (const word of words) {
      rawWords.push({
        category,
        source: 'Wiktionary italiano',
        sourceUrl: `${IT_WIKTIONARY_API}?action=query&list=categorymembers&cmtitle=${encodeURIComponent(`Categoria:${category}`)}&cmnamespace=0&cmlimit=max&format=json&formatversion=2`,
        word,
      })
    }
    await sleep(REQUEST_DELAY_MS)
  }

  for (const source of dialect.apiSources ?? []) {
    for (const category of source.categories) {
      const words = await fetchCategoryMembers(source.api, category)
      for (const word of words) {
        rawWords.push({
          category,
          source: source.name,
          sourceUrl: `${source.api}?action=query&list=categorymembers&cmtitle=${encodeURIComponent(`Categoria:${category}`)}&cmnamespace=0&cmlimit=max&format=json&formatversion=2`,
          word,
        })
      }
      await sleep(REQUEST_DELAY_MS)
    }
  }

  for (const source of dialect.dumpSources ?? []) {
    rawWords.push(...(await fetchWiktionaryDumpWords(source)))
  }

  const entries = buildEntries(rawWords)
  await writeDialectFiles(dialectId, dialect, entries, rawWords)

  const summary = Object.entries(groupByLength(entries))
    .map(([length, words]) => `${length}:${words.length}`)
    .join(', ')

  console.log(`${dialect.name}: ${entries.length} parole uniche salvate (${summary})`)
}

async function main() {
  const requested = process.argv.slice(2)
  const dialectIds = requested.length > 0 ? requested : Object.keys(dialectCatalog)

  await mkdir(OUTPUT_ROOT, { recursive: true })

  for (const dialectId of dialectIds) {
    await downloadDialect(dialectId)
  }
}

await main()
