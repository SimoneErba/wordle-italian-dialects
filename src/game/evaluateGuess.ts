import { EvaluationTile } from '../types'
import { getLetters, normalizeWord } from './text'

export function evaluateGuess(guess: string, answer: string): EvaluationTile[] {
  const guessLetters = getLetters(normalizeWord(guess))
  const answerLetters = getLetters(normalizeWord(answer))
  const result: EvaluationTile[] = guessLetters.map((letter) => ({
    letter,
    status: 'absent',
  }))
  const remaining = new Map<string, number>()

  for (let index = 0; index < answerLetters.length; index += 1) {
    if (guessLetters[index] === answerLetters[index]) {
      result[index].status = 'correct'
      continue
    }

    remaining.set(answerLetters[index], (remaining.get(answerLetters[index]) ?? 0) + 1)
  }

  for (let index = 0; index < guessLetters.length; index += 1) {
    if (result[index].status === 'correct') {
      continue
    }

    const count = remaining.get(guessLetters[index]) ?? 0
    if (count > 0) {
      result[index].status = 'present'
      remaining.set(guessLetters[index], count - 1)
    }
  }

  return result
}
