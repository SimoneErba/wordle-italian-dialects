import { DailyGameState, GameMode, GameStats, SettingsState } from '../types'

const SETTINGS_KEY = 'paroli:settings'

function statsKey(dialectId: string, wordLength: number): string {
  return `paroli:stats:${dialectId}:${wordLength}`
}

function gameKey(dialectId: string, mode: GameMode, wordLength: number, puzzleDate: string): string {
  return `paroli:game:${dialectId}:${mode}:${wordLength}:${puzzleDate}`
}

const defaultStats: GameStats = {
  played: 0,
  won: 0,
  currentStreak: 0,
  maxStreak: 0,
  winDistribution: [0, 0, 0, 0, 0, 0],
  hintsUsed: 0,
}

export function loadSettings(): SettingsState | null {
  const raw = localStorage.getItem(SETTINGS_KEY)
  return raw ? (JSON.parse(raw) as SettingsState) : null
}

export function saveSettings(settings: SettingsState): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function loadStats(dialectId: string, wordLength: number): GameStats {
  const raw = localStorage.getItem(statsKey(dialectId, wordLength))
  return raw ? { ...defaultStats, ...(JSON.parse(raw) as GameStats) } : defaultStats
}

export function saveStats(dialectId: string, wordLength: number, stats: GameStats): void {
  localStorage.setItem(statsKey(dialectId, wordLength), JSON.stringify(stats))
}

export function loadDailyGame(
  dialectId: string,
  mode: GameMode,
  wordLength: number,
  puzzleDate: string,
): DailyGameState | null {
  const raw = localStorage.getItem(gameKey(dialectId, mode, wordLength, puzzleDate))
  return raw ? (JSON.parse(raw) as DailyGameState) : null
}

export function saveDailyGame(state: DailyGameState): void {
  localStorage.setItem(
    gameKey(state.dialectId, state.mode, state.wordLength, state.puzzleDate),
    JSON.stringify(state),
  )
}
