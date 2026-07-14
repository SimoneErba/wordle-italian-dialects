import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const BASE_URL = 'https://ditzionariu.nor-web.eu'
const OUTPUT_ROOT = path.resolve(process.cwd(), 'data', 'ditzionariu', 'sardo')
const PAGE_CACHE_ROOT = path.join(OUTPUT_ROOT, 'pages')
const segmenter = new Intl.Segmenter('it', { granularity: 'grapheme' })
const REQUEST_DELAY_MS = Number(process.env.DITZIONARIU_DELAY_MS ?? 900)
const MAX_RETRIES = 4
const DEFAULT_LETTERS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'L',
  'M',
  'N',
  'O',
  'P',
  'R',
  'S',
  'T',
  'TZ',
  'U',
  'V',
  'X',
  'Z',
]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeWord(value) {
  return decodeHtml(value)
    .replace(/['`´’]/g, '’')
    .normalize('NFC')
    .trim()
    .toLocaleLowerCase('it')
}

function getLetters(word) {
  return [...segmenter.segment(word.normalize('NFC'))].map((part) => part.segment)
}

function isWordLike(word) {
  return getLetters(word).every((letter) => /\p{L}/u.test(letter) || letter === '’')
}

function decodeHtml(value) {
  const namedEntities = {
    agrave: 'à',
    aacute: 'á',
    acirc: 'â',
    atilde: 'ã',
    egrave: 'è',
    eacute: 'é',
    ecirc: 'ê',
    igrave: 'ì',
    iacute: 'í',
    icirc: 'î',
    ograve: 'ò',
    oacute: 'ó',
    ocirc: 'ô',
    ugrave: 'ù',
    uacute: 'ú',
    ucirc: 'û',
    ntilde: 'ñ',
    ccedil: 'ç',
    nbsp: ' ',
    amp: '&',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
  }

  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (entity, name) => namedEntities[name.toLowerCase()] ?? entity)
}

function stripTags(value) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|span|strong|em|a|li|td|th|tr)>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function cachePathFor(letter, page) {
  return path.join(PAGE_CACHE_ROOT, letter, `${page}.html`)
}

async function readCachedPage(letter, page) {
  try {
    return await readFile(cachePathFor(letter, page), 'utf8')
  } catch {
    return null
  }
}

async function writeCachedPage(letter, page, html) {
  const filePath = cachePathFor(letter, page)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, html)
}

async function fetchPage(letter, page) {
  const cached = await readCachedPage(letter, page)
  if (cached) {
    return cached
  }

  const url = `${BASE_URL}/it/leghe/${encodeURIComponent(letter)}/${page}`
  let lastError

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'wordle-dialetti-importer/0.1 (+local research)',
      },
    }).catch((error) => {
      lastError = error
      return null
    })

    if (response?.ok) {
      const html = await response.text()
      await writeCachedPage(letter, page, html)
      await sleep(REQUEST_DELAY_MS)
      return html
    }

    const retryable = !response || response.status === 429 || response.status >= 500
    if (!retryable || attempt === MAX_RETRIES - 1) {
      if (response) {
        throw new Error(`Ditzionariu request failed for ${url}: ${response.status} ${response.statusText}`)
      }

      throw lastError
    }

    await sleep(REQUEST_DELAY_MS * (attempt + 1))
  }

  throw new Error(`Ditzionariu request failed for ${url}`)
}

function extractWordboxes(html) {
  const boxes = []
  const pattern = /<div class="shadow-z-1 wordbox">([\s\S]*?)(?=<div class="shadow-z-1 wordbox">|<div class="text-center">\s*<ul class="pagination">|<\/div>\s*<\/div>\s*<\/div>\s*<div class="panel-footer")/g

  for (const match of html.matchAll(pattern)) {
    boxes.push(match[1])
  }

  return boxes
}

function extractDefinition(box) {
  const markerIndex = box.search(/<span class="icon-preview">[\s\S]*?<span>Definizione<\/span>[\s\S]*?<\/span>/i)
  if (markerIndex === -1) {
    return ''
  }

  const afterMarker = box
    .slice(markerIndex)
    .replace(/^<span class="icon-preview">[\s\S]*?<span>Definizione<\/span>[\s\S]*?<\/span>/i, '')
  const nextSectionIndex = afterMarker.search(/<span class="icon-preview">/i)
  const definitionHtml = nextSectionIndex === -1 ? afterMarker : afterMarker.slice(0, nextSectionIndex)

  return stripTags(definitionHtml)
}

function extractCategory(box) {
  const match = box.match(/<strong[^>]*font-size:\s*large[^>]*>[\s\S]*?<\/strong>\s*<em>\s*,?\s*([^<:]+)[\s\S]*?<\/em>/i)
  return match ? stripTags(match[1]) : undefined
}

function extractEntriesFromPage(html, letter, page) {
  const entries = []

  for (const box of extractWordboxes(html)) {
    const wordMatch = box.match(/<strong[^>]*font-size:\s*large[^>]*>([\s\S]*?)<\/strong>/i)
    if (!wordMatch) {
      continue
    }

    const word = normalizeWord(wordMatch[1])
    const definition = extractDefinition(box)

    if (!word || !definition || !isWordLike(word)) {
      continue
    }

    entries.push({
      word,
      length: getLetters(word).length,
      definition,
      categories: [extractCategory(box)].filter(Boolean),
      sources: ['Ditzionàriu in línia'],
      sourceUrls: [`${BASE_URL}/it/faeddu/${encodeURIComponent(word)}`],
      titles: [word],
      scrapedFrom: `${BASE_URL}/it/leghe/${encodeURIComponent(letter)}/${page}`,
    })
  }

  return entries
}

function getLastPage(html, letter) {
  const pages = [...html.matchAll(new RegExp(`/it/leghe/${letter}/(\\d+)`, 'g'))].map((match) => Number(match[1]))
  return pages.length > 0 ? Math.max(...pages) : 1
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

async function writeOutput(entries, metadata) {
  const lengthsDir = path.join(OUTPUT_ROOT, 'lengths')
  const grouped = groupByLength(entries)

  await mkdir(lengthsDir, { recursive: true })
  await writeFile(path.join(OUTPUT_ROOT, 'metadata.json'), JSON.stringify(metadata, null, 2))
  await writeFile(path.join(OUTPUT_ROOT, 'all-words.json'), JSON.stringify(entries, null, 2))
  await writeFile(path.join(OUTPUT_ROOT, 'by-length.json'), JSON.stringify(grouped, null, 2))

  for (const [length, words] of Object.entries(grouped)) {
    await writeFile(path.join(lengthsDir, `${length}.json`), JSON.stringify(words, null, 2))
  }

  if (!grouped['5']) {
    await writeFile(path.join(lengthsDir, '5.json'), JSON.stringify([], null, 2))
  }
}

function parseArgs() {
  const args = new Map()

  for (const item of process.argv.slice(2)) {
    const [key, value = 'true'] = item.replace(/^--/, '').split('=')
    args.set(key, value)
  }

  const letters = (args.get('letters') ?? DEFAULT_LETTERS.join(','))
    .split(',')
    .map((letter) => letter.trim().toUpperCase())
    .filter(Boolean)
  const maxPages = args.has('max-pages') ? Number(args.get('max-pages')) : Infinity

  return { letters, maxPages }
}

async function main() {
  const { letters, maxPages } = parseArgs()
  const unique = new Map()
  const pagesByLetter = {}

  await mkdir(OUTPUT_ROOT, { recursive: true })

  for (const letter of letters) {
    const firstPageHtml = await fetchPage(letter, 1)
    const lastPage = Math.min(getLastPage(firstPageHtml, letter), maxPages)
    pagesByLetter[letter] = lastPage

    for (let page = 1; page <= lastPage; page += 1) {
      const html = page === 1 ? firstPageHtml : await fetchPage(letter, page)
      for (const entry of extractEntriesFromPage(html, letter, page)) {
        const existing = unique.get(entry.word)
        if (existing) {
          existing.categories = Array.from(new Set([...existing.categories, ...entry.categories]))
          existing.sourceUrls = Array.from(new Set([...existing.sourceUrls, ...entry.sourceUrls]))
          existing.titles = Array.from(new Set([...existing.titles, ...entry.titles]))
          continue
        }

        unique.set(entry.word, entry)
      }

      if (page % 25 === 0 || page === lastPage) {
        console.log(`${letter}: ${page}/${lastPage} pagine, ${unique.size} parole uniche`)
      }
    }
  }

  const entries = [...unique.values()].sort((left, right) => {
    if (left.length !== right.length) {
      return left.length - right.length
    }
    return left.word.localeCompare(right.word, 'it')
  })
  const metadata = {
    dialectId: 'sardo',
    dialectName: 'Sardo',
    downloadedAt: new Date().toISOString(),
    source: 'Ditzionàriu in línia de sa limba e de sa cultura sarda',
    sourceUrl: BASE_URL,
    pagesByLetter,
    totalUniqueWords: entries.length,
  }

  await writeOutput(entries, metadata)

  const summary = Object.entries(groupByLength(entries))
    .map(([length, words]) => `${length}:${words.length}`)
    .join(', ')

  console.log(`Sardo: ${entries.length} parole uniche salvate (${summary})`)
}

await main()
