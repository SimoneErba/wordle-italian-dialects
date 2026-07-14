import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DATA_ROOTS = [
  path.resolve(process.cwd(), 'data', 'wiktionary'),
  path.resolve(process.cwd(), 'data', 'ditzionariu'),
]

const obscureRules = [
  {
    reason: 'missing-definition',
    pattern: /^$/,
  },
  {
    reason: 'inflected-form',
    pattern:
      /\b(forma|flessione|voce|coniugazione|participio|gerundio|plurale|singolare|femminile|maschile)\b.*\bdi\b|\b(prima|seconda|terza)\s+persona\b|\b(congiuntivo|condizionale|imperativo|indicativo|imperfetto|futuro|passato remoto)\b/i,
  },
  {
    reason: 'variant-or-spelling',
    pattern: /\b(variante|grafia|ortografia|trascrizione|forma alternativa)\b.*\bdi\b/i,
  },
  {
    reason: 'abbreviation-or-symbol',
    pattern: /\b(abbreviazione|acronimo|sigla|simbolo|lettera dell'alfabeto|lettera)\b/i,
  },
  {
    reason: 'rare-or-archaic',
    pattern: /\b(arcaico|antico|desueto|obsoleto|raro|letterario|poetico|arcaicismo)\b/i,
  },
  {
    reason: 'technical-domain',
    pattern:
      /\b(anatomia|araldica|astronomia|biologia|botanica|chimica|diritto|economia|entomologia|fisica|geologia|grammatica|informatica|matematica|medicina|mineralogia|micologia|ornitologia|tassonomia|zoologia)\b/i,
  },
  {
    reason: 'proper-name',
    pattern: /\b(nome proprio|cognome|toponimo|antroponimo)\b/i,
  },
]

function parseArgs(argv) {
  const options = {
    dialects: [],
    dryRun: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--dialect') {
      options.dialects.push(argv[++index])
    } else if (arg.startsWith('--dialect=')) {
      options.dialects.push(arg.slice('--dialect='.length))
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unsupported argument: ${arg}`)
    }
  }

  return options
}

function printHelp() {
  console.log(`Mark obscure entries as non-answer words while keeping them valid guesses.

Usage:
  node scripts/mark-guessable-words.mjs [options]

Options:
  --dialect <id>   Process one dialect. Can be repeated.
  --dry-run        Report counts without writing JSON files.
  -h, --help       Show this help.
`)
}

function classifyEntry(entry) {
  const definition = String(entry.definition ?? '').trim()
  const haystack = `${definition}\n${(entry.categories ?? []).join('\n')}`.normalize('NFC')

  for (const rule of obscureRules) {
    if (rule.pattern.test(haystack)) {
      return {
        guessable: false,
        reason: rule.reason,
      }
    }
  }

  return {
    guessable: true,
  }
}

async function fileExists(filePath) {
  try {
    await stat(filePath)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

async function findAllWordFiles(options) {
  const files = []

  for (const root of DATA_ROOTS) {
    if (!(await fileExists(root))) {
      continue
    }

    for (const dialect of await readdir(root)) {
      if (options.dialects.length > 0 && !options.dialects.includes(dialect)) {
        continue
      }

      const filePath = path.join(root, dialect, 'all-words.json')
      if (await fileExists(filePath)) {
        files.push({ dialect, filePath })
      }
    }
  }

  return files
}

async function markFile({ dialect, filePath }, options) {
  const entries = JSON.parse(await readFile(filePath, 'utf8'))
  const counts = new Map()
  let changed = 0
  let answerable = 0

  for (const entry of entries) {
    const result = classifyEntry(entry)

    if (result.guessable) {
      answerable += 1
      if (entry.guessable === false || entry.guessabilityReason) {
        delete entry.guessable
        delete entry.guessabilityReason
        changed += 1
      }
      continue
    }

    counts.set(result.reason, (counts.get(result.reason) ?? 0) + 1)
    if (entry.guessable !== false || entry.guessabilityReason !== result.reason) {
      entry.guessable = false
      entry.guessabilityReason = result.reason
      changed += 1
    }
  }

  if (!options.dryRun && changed > 0) {
    await writeFile(filePath, `${JSON.stringify(entries, null, 2)}\n`)
  }

  const rejected = entries.length - answerable
  const reasonSummary = [...counts.entries()].map(([reason, count]) => `${reason}:${count}`).join(', ')
  const suffix = options.dryRun ? ' (dry run, not written)' : ''
  console.log(`${dialect}: answerable ${answerable}/${entries.length}, non-answer ${rejected}${suffix}`)
  if (reasonSummary) {
    console.log(`  ${reasonSummary}`)
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const files = await findAllWordFiles(options)

  for (const file of files) {
    await markFile(file, options)
  }
}

await main()
