import { Answer, DialectPack } from '../types'

export function getItalianDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function djb2Hash(value: string): number {
  let hash = 5381

  for (const char of value) {
    hash = (hash * 33) ^ char.charCodeAt(0)
  }

  return hash >>> 0
}

function hasUsableDefinition(answer: Answer): boolean {
  const definition = answer.definition.trim().toLocaleLowerCase('it')
  return definition.length > 0 && definition !== 'definizione non disponibile'
}

export function getDailyAnswer(pack: DialectPack, date = getItalianDate()): Answer {
  const seed = `${pack.id}:${date}:${pack.answersVersion}`
  const preferredAnswers = pack.answers.filter(hasUsableDefinition)
  const answerPool = preferredAnswers.length > 0 ? preferredAnswers : pack.answers
  const index = djb2Hash(seed) % answerPool.length
  return answerPool[index]
}

export function getPuzzleNumber(pack: DialectPack, date = getItalianDate()): number {
  const start = new Date('2026-01-01T00:00:00+01:00')
  const current = new Date(`${date}T00:00:00+01:00`)
  const diff = current.getTime() - start.getTime()
  return Math.floor(diff / 86_400_000) + 1
}
