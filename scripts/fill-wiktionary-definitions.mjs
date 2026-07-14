import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DATA_ROOT = path.resolve(process.cwd(), 'data', 'wiktionary')
const REQUEST_DELAY_MS = 350
const MAX_RETRIES = 4
const BATCH_SIZE = 50

const dialectCatalog = {
  corso: {
    apiCodes: ['co'],
    sectionHints: ['corso', 'corsi', 'corsu', 'lingua corsa'],
  },
  lombardo: {
    apiCodes: ['lmo'],
    sectionHints: ['lombardo', 'lombard', 'lingua lombarda'],
  },
  napoletano: {
    apiCodes: ['it'],
    sectionHints: ['napoletano', 'napulitano', 'lingua napoletana'],
  },
  siciliano: {
    apiCodes: ['scn'],
    sectionHints: ['siciliano', 'sicilianu', 'lingua siciliana'],
  },
  veneto: {
    apiCodes: ['vec'],
    sectionHints: ['veneto', 'vèneto', 'venetan', 'lingua veneta'],
  },
}

function parseArgs(argv) {
  const options = {
    dialects: [],
    dryRun: false,
    force: false,
    fallbackIt: true,
    limit: Number.POSITIVE_INFINITY,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--force') {
      options.force = true
    } else if (arg === '--no-fallback-it') {
      options.fallbackIt = false
    } else if (arg === '--dialect') {
      options.dialects.push(argv[++index])
    } else if (arg.startsWith('--dialect=')) {
      options.dialects.push(arg.slice('--dialect='.length))
    } else if (arg === '--limit') {
      options.limit = Number(argv[++index])
    } else if (arg.startsWith('--limit=')) {
      options.limit = Number(arg.slice('--limit='.length))
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unsupported argument: ${arg}`)
    }
  }

  if (options.dialects.length === 0) {
    options.dialects = Object.keys(dialectCatalog)
  }

  for (const dialect of options.dialects) {
    if (!dialectCatalog[dialect]) {
      throw new Error(`Unsupported dialect "${dialect}". Available: ${Object.keys(dialectCatalog).join(', ')}`)
    }
  }

  if (!Number.isFinite(options.limit) && options.limit !== Number.POSITIVE_INFINITY) {
    throw new Error('--limit must be a number')
  }

  return options
}

function printHelp() {
  console.log(`Fill missing Wiktionary definitions in data/wiktionary/*/all-words.json.

Usage:
  node scripts/fill-wiktionary-definitions.mjs [options]

Options:
  --dialect <id>       Process one dialect. Can be repeated.
  --limit <n>          Stop after writing/finding n definitions per dialect.
  --dry-run            Fetch and parse, but do not write JSON files.
  --force              Replace existing definitions too.
  --no-fallback-it     Do not try it.wiktionary.org; use only the dialect Wiktionary.
  -h, --help           Show this help.
`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJsonWithRetries(url) {
  let lastError

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'paroli-definition-importer/0.1 (+https://github.com/SimoneErba/dialettile)',
      },
    }).catch((error) => {
      lastError = error
      return null
    })

    if (response?.ok) {
      return response.json()
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

function apiUrl(apiCode, titles) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'revisions',
    redirects: '1',
    rvprop: 'content',
    rvslots: 'main',
    titles: titles.join('|'),
  })

  return `https://${apiCode}.wiktionary.org/w/api.php?${params}`
}

async function fetchWikitextBatch(apiCode, titles) {
  const data = await fetchJsonWithRetries(apiUrl(apiCode, titles))
  const pagesByTitle = new Map()

  for (const page of data.query?.pages ?? []) {
    if (page.missing || page.invalid) {
      continue
    }

    const content = page.revisions?.[0]?.slots?.main?.content
    if (content) {
      pagesByTitle.set(page.title, content)
    }
  }

  const titleAliases = new Map()
  for (const item of data.query?.normalized ?? []) {
    titleAliases.set(item.from, item.to)
  }
  for (const item of data.query?.redirects ?? []) {
    titleAliases.set(item.from, item.to)
  }

  const result = new Map()
  for (const title of titles) {
    const normalizedTitle = titleAliases.get(title) ?? title
    const redirectedTitle = titleAliases.get(normalizedTitle) ?? normalizedTitle
    const content = pagesByTitle.get(redirectedTitle) ?? pagesByTitle.get(normalizedTitle) ?? pagesByTitle.get(title)

    if (content) {
      result.set(title, content)
    }
  }

  return result
}

function chunk(values, size) {
  const chunks = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function apiCodesForDialect(dialect, options) {
  const dialectCodes = dialectCatalog[dialect].apiCodes
  if (!options.fallbackIt) {
    return dialectCodes
  }

  return unique(['it', ...dialectCodes])
}

function definitionSections(wikitext, dialect) {
  const sections = []
  let current = { heading: '', body: [] }

  for (const line of wikitext.split(/\r?\n/)) {
    const headingMatch = line.match(/^={2,}\s*(.*?)\s*={2,}\s*$/)
    if (headingMatch) {
      sections.push(current)
      current = { heading: headingMatch[1], body: [] }
      continue
    }

    current.body.push(line)
  }
  sections.push(current)

  const hints = dialectCatalog[dialect].sectionHints.map((hint) => hint.toLocaleLowerCase('it'))
  const hintedSections = sections.filter((section) => {
    const text = `${section.heading}\n${section.body.join('\n')}`.toLocaleLowerCase('it')
    return hints.some((hint) => text.includes(hint))
  })

  return hintedSections.length > 0 ? hintedSections.map((section) => section.body.join('\n')) : [wikitext]
}

function stripTemplates(value) {
  let text = value

  for (let pass = 0; pass < 12; pass += 1) {
    const next = text.replace(/\{\{([^{}]*)\}\}/g, (_match, body) => {
      const parts = body.split('|').map((part) => part.trim()).filter(Boolean)
      const name = parts[0]?.toLocaleLowerCase('it') ?? ''

      if (['l', 'link', 'm', 'term', 'termine'].includes(name)) {
        return parts[2] ?? parts[1] ?? ''
      }

      if (['w', 'wiki', 'wikipedia'].includes(name)) {
        return parts[1] ?? ''
      }

      if (['gloss', 'glossa'].includes(name)) {
        return parts[1] ?? ''
      }

      return ''
    })

    if (next === text) {
      return text
    }
    text = next
  }

  return text
}

function cleanDefinitionLine(line) {
  return stripTemplates(line)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, ' ')
    .replace(/<ref\b[^/]*\/>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[\[[^[\]|]+?\|([^[\]]+?)\]\]/g, '$1')
    .replace(/\[\[([^[\]|]+?)\]\]/g, '$1')
    .replace(/\[https?:\/\/[^\s\]]+\s*([^\]]*)\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()
}

function isUsableDefinition(value) {
  if (value.length < 3) {
    return false
  }

  if (/^(categoria|category|file|image|immagine):/i.test(value)) {
    return false
  }

  if (/definizione\s+mancante|missing\s+definition/i.test(value)) {
    return false
  }

  return /\p{L}/u.test(value)
}

function extractFirstDefinition(wikitext, dialect) {
  for (const section of definitionSections(wikitext, dialect)) {
    for (const rawLine of section.split(/\r?\n/)) {
      const line = rawLine.trim()
      const definitionMatch = line.match(/^#+(?![:*;])\s*(.+)$/)

      if (!definitionMatch) {
        continue
      }

      const definition = cleanDefinitionLine(definitionMatch[1])
      if (isUsableDefinition(definition)) {
        return definition
      }
    }
  }

  return undefined
}

async function definitionsFromApi(apiCode, dialect, entries, maxDefinitions = Number.POSITIVE_INFINITY) {
  const definitions = new Map()
  const titleToEntryIndexes = new Map()

  for (const entry of entries) {
    const title = entry.titles?.[0] ?? entry.word
    if (!titleToEntryIndexes.has(title)) {
      titleToEntryIndexes.set(title, [])
    }
    titleToEntryIndexes.get(title).push(entry.index)
  }

  const titles = [...titleToEntryIndexes.keys()]
  const titleBatches = chunk(titles, BATCH_SIZE)

  for (const [batchIndex, titleBatch] of titleBatches.entries()) {
    const pages = await fetchWikitextBatch(apiCode, titleBatch)

    for (const [title, wikitext] of pages.entries()) {
      const definition = extractFirstDefinition(wikitext, dialect)
      if (!definition) {
        continue
      }

      for (const entryIndex of titleToEntryIndexes.get(title) ?? []) {
        definitions.set(entryIndex, definition)
      }

      if (definitions.size >= maxDefinitions) {
        break
      }
    }

    console.log(`  ${apiCode}: parsed batch ${batchIndex + 1}/${titleBatches.length}, found ${definitions.size}`)
    if (definitions.size >= maxDefinitions) {
      break
    }

    await sleep(REQUEST_DELAY_MS)
  }

  return definitions
}

async function fillDialect(dialect, options) {
  const filePath = path.join(DATA_ROOT, dialect, 'all-words.json')
  const entries = JSON.parse(await readFile(filePath, 'utf8'))
  const targetEntries = entries
    .map((entry, index) => ({ ...entry, index }))
    .filter((entry) => options.force || !entry.definition?.trim())

  if (targetEntries.length === 0) {
    console.log(`${dialect}: no missing definitions`)
    return
  }

  let remaining = targetEntries
  let filled = 0

  console.log(`${dialect}: ${targetEntries.length} entries need definitions`)

  for (const apiCode of apiCodesForDialect(dialect, options)) {
    if (remaining.length === 0 || filled >= options.limit) {
      break
    }

    const definitions = await definitionsFromApi(apiCode, dialect, remaining, options.limit - filled)
    const stillMissing = []

    for (const entry of remaining) {
      const definition = definitions.get(entry.index)
      if (!definition) {
        stillMissing.push(entry)
        continue
      }

      if (filled < options.limit) {
        entries[entry.index].definition = definition
        filled += 1
      }
    }

    remaining = stillMissing
  }

  if (!options.dryRun && filled > 0) {
    await writeFile(filePath, `${JSON.stringify(entries, null, 2)}\n`)
  }

  const suffix = options.dryRun ? ' (dry run, not written)' : ''
  console.log(`${dialect}: filled ${filled}, still missing ${remaining.length}${suffix}`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  for (const dialect of options.dialects) {
    await fillDialect(dialect, options)
  }
}

await main()
