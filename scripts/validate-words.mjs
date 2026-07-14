const fs = await import('node:fs/promises')
const path = await import('node:path')
const process = await import('node:process')

const dialectsDir = path.resolve(process.cwd(), 'src', 'dialects')

function normalizeWord(value) {
  return value.normalize('NFC').trim().toLocaleLowerCase('it')
}

function getLetters(word) {
  const segmenter = new Intl.Segmenter('it', { granularity: 'grapheme' })
  return [...segmenter.segment(word.normalize('NFC'))].map((part) => part.segment)
}

function hasOnlyLetters(word) {
  return getLetters(word).every((letter) => /\p{L}/u.test(letter))
}

const source = await fs.readFile(path.join(dialectsDir, 'napoletano.ts'), 'utf8')
const answerMatches = [...source.matchAll(/word: '([^']+)'.+?definition: '([^']+)'.+?sourceUrl: '([^']+)'/gs)]
const guessMatches = [...source.matchAll(/'\w+'/g)].map((match) => match[0].slice(1, -1))

const answers = answerMatches.map((match) => ({
  word: match[1],
  definition: match[2],
  sourceUrl: match[3],
}))

const guesses = new Set(guessMatches.map(normalizeWord))
const seen = new Set()
const failures = []

for (const answer of answers) {
  const normalized = normalizeWord(answer.word)
  if (getLetters(normalized).length !== 5) {
    failures.push(`Wrong length: ${answer.word}`)
  }
  if (!hasOnlyLetters(normalized)) {
    failures.push(`Unsupported characters: ${answer.word}`)
  }
  if (!answer.definition) {
    failures.push(`Missing definition: ${answer.word}`)
  }
  if (!answer.sourceUrl) {
    failures.push(`Missing source URL: ${answer.word}`)
  }
  if (!guesses.has(normalized)) {
    failures.push(`Answer missing from valid guesses: ${answer.word}`)
  }
  if (seen.has(normalized)) {
    failures.push(`Normalized duplicate: ${answer.word}`)
  }
  seen.add(normalized)
}

if (failures.length > 0) {
  console.error('Word validation failed:\n' + failures.join('\n'))
  process.exit(1)
}

console.log(`Validated ${answers.length} answers and ${guesses.size} accepted guesses.`)
