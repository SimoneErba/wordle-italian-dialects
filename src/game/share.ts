import { DialectPack, EvaluationTile } from '../types'
import { getPuzzleNumber } from './dailyPuzzle'

const emojiMap = {
  correct: '🟩',
  present: '🟨',
  absent: '⬛',
} as const

export function buildShareText(args: {
  pack: DialectPack
  date: string
  evaluations: EvaluationTile[][]
  won: boolean
}): string {
  const score = args.won ? `${args.evaluations.length}/6` : 'X/6'
  const title = `WORDLE ${args.pack.name} #${getPuzzleNumber(args.pack, args.date)}`
  const grid = args.evaluations
    .map((row) => row.map((tile) => emojiMap[tile.status]).join(''))
    .join('\n')

  return `${title}\n${score}\n\n${grid}`
}
