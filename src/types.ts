export type LetterStatus = 'correct' | 'present' | 'absent'

export type GameMode = 'classic'
export type UiLanguage = 'it' | 'en'
export type ThemeMode = 'light' | 'dark'

export interface Source {
  label: string
  url: string
  license?: string
}

export interface Answer {
  word: string
  normalized: string
  definition: string
  category?: string
  example?: string
  variant?: string
  sourceUrl: string
}

export interface DialectPack {
  id: string
  name: string
  area: string
  locale: string
  wordLength: number
  availableWordLengths: number[]
  alphabet: string[]
  answersVersion: string
  answers: Answer[]
  validGuesses: string[]
  sources: Source[]
}

export interface EvaluationTile {
  letter: string
  status: LetterStatus
}

export interface GameStats {
  played: number
  won: number
  currentStreak: number
  maxStreak: number
  winDistribution: number[]
  hintsUsed: number
}

export interface DailyGameState {
  dialectId: string
  mode: GameMode
  wordLength: number
  puzzleDate: string
  answerWord: string
  guesses: string[]
  evaluations: EvaluationTile[][]
  status: 'playing' | 'won' | 'lost'
  hintsUsed: number
}

export interface SettingsState {
  dialectId: string
  mode: GameMode
  wordLength: number
  uiLanguage: UiLanguage
  theme: ThemeMode
}
