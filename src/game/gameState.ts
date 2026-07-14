import { DialectPack, DailyGameState, GameMode, GameStats } from '../types'
import { getDailyAnswer, getItalianDate } from './dailyPuzzle'
import { evaluateGuess } from './evaluateGuess'
import { getLetters, normalizeWord } from './text'
import { loadDailyGame, loadStats, saveDailyGame, saveStats } from './storage'

const MAX_ATTEMPTS = 6
const guessCache = new Map<string, Set<string>>()

function getAnswerForMode(pack: DialectPack, date: string) {
  return getDailyAnswer(pack, date)
}

export function createOrLoadDailyState(pack: DialectPack, mode: GameMode): DailyGameState {
  const date = getItalianDate()

  const stored = loadDailyGame(pack.id, mode, pack.wordLength, date)
  if (stored) {
    return stored
  }

  const answer = getAnswerForMode(pack, date)

  return {
    dialectId: pack.id,
    mode,
    wordLength: pack.wordLength,
    puzzleDate: date,
    answerWord: answer.word,
    guesses: [],
    evaluations: [],
    status: 'playing',
    hintsUsed: 0,
  }
}

export function canSubmitGuess(guess: string, pack: DialectPack): boolean {
  const normalized = normalizeWord(guess)
  const cacheKey = `${pack.id}:${pack.wordLength}:${pack.answersVersion}`
  const validGuesses = guessCache.get(cacheKey) ?? new Set(pack.validGuesses)
  guessCache.set(cacheKey, validGuesses)
  return validGuesses.has(normalized) && getLetters(normalized).length === pack.wordLength
}

export function submitGuess(state: DailyGameState, guess: string): DailyGameState {
  const evaluation = evaluateGuess(guess, state.answerWord)
  const normalizedGuess = normalizeWord(guess)
  const won = normalizedGuess === normalizeWord(state.answerWord)
  const nextStatus =
    won ? 'won' : state.guesses.length + 1 >= MAX_ATTEMPTS ? 'lost' : 'playing'

  return {
    ...state,
    guesses: [...state.guesses, normalizedGuess],
    evaluations: [...state.evaluations, evaluation],
    status: nextStatus,
  }
}

export function persistState(state: DailyGameState): void {
  saveDailyGame(state)
}

export function updateStatsForCompletedGame(
  dialectId: string,
  state: DailyGameState,
): GameStats {
  const stats = loadStats(dialectId, state.wordLength)
  const won = state.status === 'won'
  const next: GameStats = {
    ...stats,
    played: stats.played + 1,
    won: stats.won + (won ? 1 : 0),
    currentStreak: won ? stats.currentStreak + 1 : 0,
    maxStreak: won ? Math.max(stats.maxStreak, stats.currentStreak + 1) : stats.maxStreak,
    winDistribution: [...stats.winDistribution],
    hintsUsed: stats.hintsUsed + state.hintsUsed,
  }

  if (won) {
    next.winDistribution[state.guesses.length - 1] += 1
  }

  saveStats(dialectId, state.wordLength, next)
  return next
}
