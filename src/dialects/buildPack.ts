import { getLetters, normalizeWord } from '../game/text'
import { Answer, DialectPack } from '../types'

interface DownloadedEntry {
  word: string
  length: number
  definition?: string
  guessable?: boolean
  categories: string[]
  sources?: string[]
  titles: string[]
  sourceUrls: string[]
}

function buildAlphabet(words: string[]): string[] {
  const letters = new Set<string>()

  for (const word of words) {
    for (const letter of getLetters(word)) {
      letters.add(letter.toUpperCase())
    }
  }

  return [...letters].sort((left, right) => left.localeCompare(right, 'it'))
}

function buildAvailableWordLengths(entries: DownloadedEntry[]): number[] {
  return [...new Set(entries.map((entry) => entry.length))]
    .filter((length) => length >= 3 && length <= 10)
    .sort((left, right) => left - right)
}

function titleUrl(title: string): string {
  return `https://it.wiktionary.org/wiki/${encodeURIComponent(title)}`
}

function lexicalPageUrl(entry: DownloadedEntry): string {
  const title = entry.titles[0] ?? entry.word

  if (entry.sources?.includes('Wikizionario corso') || entry.sourceUrls.some((url) => url.includes('cowiktionary'))) {
    return `https://co.wiktionary.org/wiki/${encodeURIComponent(title)}`
  }

  if (entry.sources?.includes('Wikizionario lombardo') || entry.sourceUrls.some((url) => url.includes('lmowiktionary'))) {
    return `https://lmo.wiktionary.org/wiki/${encodeURIComponent(title)}`
  }

  if (entry.sources?.includes('Wikizionario siciliano') || entry.sourceUrls.some((url) => url.includes('scnwiktionary'))) {
    return `https://scn.wiktionary.org/wiki/${encodeURIComponent(title)}`
  }

  if (entry.sources?.includes('Wikizionario veneto') || entry.sourceUrls.some((url) => url.includes('vec.wiktionary') || url.includes('vecwiktionary'))) {
    return `https://vec.wiktionary.org/wiki/${encodeURIComponent(title)}`
  }

  return titleUrl(title)
}

function toAnswer(entry: DownloadedEntry): Answer {
  return {
    word: entry.word,
    normalized: normalizeWord(entry.word),
    definition: entry.definition?.trim() || 'Definizione non disponibile',
    category: entry.categories.join(', '),
    variant: undefined,
    example: undefined,
    sourceUrl: lexicalPageUrl(entry),
  }
}

function sourceLabelFromUrl(url: string): string {
  if (url.includes('ditzionariu.nor-web.eu')) {
    return 'Ditzionàriu in línia'
  }

  if (url.includes('cowiktionary')) {
    return 'Wikizionario corso'
  }

  if (url.includes('scnwiktionary')) {
    return 'Wikizionario siciliano'
  }

  if (url.includes('lmowiktionary')) {
    return 'Wikizionario lombardo'
  }

  if (url.includes('vec.wiktionary') || url.includes('vecwiktionary')) {
    return 'Wikizionario veneto'
  }

  return 'Wiktionary italiano'
}

function normalizeSourceUrl(url: string): string {
  if (url.includes('ditzionariu.nor-web.eu')) {
    return 'https://ditzionariu.nor-web.eu'
  }

  if (url.includes('it.wiktionary.org')) {
    return 'https://it.wiktionary.org'
  }

  const wiktionaryDumpMatch = url.match(/^(https:\/\/dumps\.wikimedia\.org\/[^/]+\/latest)/)
  if (wiktionaryDumpMatch) {
    return wiktionaryDumpMatch[1]
  }

  return url
}

function sourceLicenseFromUrl(url: string): string | undefined {
  if (url.includes('ditzionariu.nor-web.eu')) {
    return 'Licenza fonte da verificare'
  }

  return 'CC BY-SA'
}

function buildSources(entries: DownloadedEntry[]): DialectPack['sources'] {
  const sourcesByUrl = new Map<string, string>()

  for (const entry of entries) {
    for (const url of entry.sourceUrls) {
      const normalizedUrl = normalizeSourceUrl(url)
      if (!sourcesByUrl.has(normalizedUrl)) {
        sourcesByUrl.set(normalizedUrl, sourceLabelFromUrl(url))
      }
    }
  }

  return [...sourcesByUrl.entries()].map(([url, label]) => ({
    label,
    url,
    license: sourceLicenseFromUrl(url),
  }))
}

export function buildPackFromDownloadedFiles(args: {
  id: string
  name: string
  area: string
  locale: string
  wordLength: number
  answersVersion: string
  validGuesses?: string[]
  entries: DownloadedEntry[]
}): DialectPack {
  const validWords =
    args.validGuesses ??
    args.entries
      .filter((entry) => entry.length === args.wordLength)
      .map((entry) => entry.word)
  const validGuessSet = new Set(validWords.map((word) => normalizeWord(word)))
  const answersByNormalized = new Map<string, Answer>()

  for (const entry of args.entries) {
    if (entry.length !== args.wordLength) {
      continue
    }

    if (entry.guessable === false) {
      continue
    }

    const normalized = normalizeWord(entry.word)
    if (!validGuessSet.has(normalized) || answersByNormalized.has(normalized)) {
      continue
    }

    answersByNormalized.set(normalized, toAnswer(entry))
  }

  const validGuesses = [...validGuessSet].sort((left, right) => left.localeCompare(right, 'it'))
  const answers = [...answersByNormalized.values()]

  return {
    id: args.id,
    name: args.name,
    area: args.area,
    locale: args.locale,
    wordLength: args.wordLength,
    availableWordLengths: buildAvailableWordLengths(args.entries),
    alphabet: buildAlphabet(validGuesses),
    answersVersion: `${args.answersVersion}:len-${args.wordLength}`,
    answers,
    validGuesses,
    sources: buildSources(args.entries),
  }
}
