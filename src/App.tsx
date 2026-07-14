import { useEffect, useMemo, useState } from 'react'
import { Grid } from './components/Grid'
import { Keyboard } from './components/Keyboard'
import { Modal } from './components/Modal'
import { dialectPacks, getDialectById } from './dialects'
import {
  canSubmitGuess,
  createOrLoadDailyState,
  persistState,
  submitGuess,
  updateStatsForCompletedGame,
} from './game/gameState'
import { buildShareText } from './game/share'
import { normalizeWord } from './game/text'
import { loadSettings, loadStats, saveSettings } from './game/storage'
import { DailyGameState, DialectPack, GameMode, LetterStatus, ThemeMode, UiLanguage } from './types'

const appTitle = 'Wordle - Dialetti Italiani'
const appSubtitle = 'Un gioco di parole dedicato ai dialetti italiani'

const copy = {
  it: {
    language: 'Lingua',
    theme: 'Tema',
    title: appTitle,
    dialect: 'Dialetto',
    wordLength: 'Lunghezza',
    lettersCount: (count: number) => `${count} lettere`,
    sources: 'Fonti',
    help: 'Aiuto',
    stats: 'Statistiche',
    definition: 'Definizione',
    sourceAttribution: 'Fonti e attribuzione',
    sourcesLead:
      'Ogni lingua usa dataset importati da fonti lessicali aperte o consultabili online. Qui trovi fonti e parole disponibili per lunghezza.',
    wordsByLength: 'Parole per lunghezza',
    totalWords: 'Totale parole giocabili',
    reportLabel: 'Segnala una grafia o una definizione:',
    invalidGuess: 'Parola non valida',
    needsLetters: (count: number) => `Servono ${count} lettere`,
    copied: 'Risultato copiato negli appunti',
    wonMessage: 'Parola trovata',
    lostMessage: (word: string) => `Fine partita: ${word}`,
    helpTitle: 'Come si gioca',
    help1: 'Indovina una parola della lunghezza scelta in sei tentativi.',
    help2: 'Verde: lettera giusta al posto giusto. Giallo: lettera presente in altra posizione.',
    help3: 'La soluzione e la fonte originale vengono mostrate a fine partita.',
    statsTitle: 'Statistiche',
    played: 'Partite',
    won: 'Vittorie',
    streak: 'Serie',
    maxStreak: 'Serie max',
    share: 'Condividi',
    openSource: 'Apri la fonte originale',
    lexicalEntry: 'voce lessicale',
    dayWord: 'Parola del giorno',
    youWon: 'Hai vinto',
    enter: 'INVIO',
    backspace: 'CANC',
    close: 'Chiudi',
    winTitle: '🎉 Hai vinto 🎉',
    loseTitle: 'Parola finale',
    keepPlaying: 'Continua',
  },
  en: {
    language: 'Language',
    theme: 'Theme',
    title: appTitle,
    dialect: 'Dialect',
    wordLength: 'Length',
    lettersCount: (count: number) => `${count} letters`,
    sources: 'Sources',
    help: 'Help',
    stats: 'Stats',
    definition: 'Definition',
    sourceAttribution: 'Sources and attribution',
    sourcesLead:
      'Each language uses datasets imported from lexical sources or online dictionaries. Here are the sources and available words by length.',
    wordsByLength: 'Words by length',
    totalWords: 'Total playable words',
    reportLabel: 'Report a spelling or definition:',
    invalidGuess: 'Invalid word',
    needsLetters: (count: number) => `${count} letters required`,
    copied: 'Result copied to clipboard',
    wonMessage: 'Word found',
    lostMessage: (word: string) => `Game over: ${word}`,
    helpTitle: 'How to play',
    help1: 'Guess a word of the selected length in six tries.',
    help2: 'Green: right letter in the right spot. Yellow: letter present in another spot.',
    help3: 'The solution and original source are shown at the end of the game.',
    statsTitle: 'Statistics',
    played: 'Games',
    won: 'Wins',
    streak: 'Streak',
    maxStreak: 'Best streak',
    share: 'Share',
    openSource: 'Open original source',
    lexicalEntry: 'lexical entry',
    dayWord: 'Word of the day',
    youWon: 'You won',
    enter: 'ENTER',
    backspace: 'DEL',
    close: 'Close',
    winTitle: '🎉 You won 🎉',
    loseTitle: 'Final word',
    keepPlaying: 'Continue',
  },
} as const

function buildKeyboardRows(alphabet: string[]): string[][] {
  const upper = alphabet.map((letter) => letter.toUpperCase())
  const first = Math.ceil(upper.length * 0.4)
  const second = Math.ceil(upper.length * 0.35)
  return [upper.slice(0, first), upper.slice(first, first + second), upper.slice(first + second)]
}

function buildLengthCounts(dialectId: string, lengths: number[]): Array<{ length: number; count: number }> {
  return lengths
    .filter((length) => length >= 4)
    .map((length) => ({
      length,
      count: getDialectById(dialectId, length).validGuesses.length,
    }))
}

function dedupeDisplaySources(sources: DialectPack['sources']): DialectPack['sources'] {
  const sourcesByLabel = new Map<string, DialectPack['sources'][number]>()

  for (const source of sources) {
    const key = `${source.label}:${source.license ?? ''}`
    if (!sourcesByLabel.has(key)) {
      sourcesByLabel.set(key, source)
    }
  }

  return [...sourcesByLabel.values()]
}

function buildEmptyGuess(wordLength: number): string[] {
  return Array.from({ length: wordLength }, () => '')
}

function FlagLogo({
  compact = false,
  variant = 'it',
}: {
  compact?: boolean
  variant?: 'it' | 'en'
}) {
  if (variant === 'en') {
    return (
      <span
        aria-hidden="true"
        className={compact ? 'flag-logo flag-logo-uk flag-logo-compact' : 'flag-logo flag-logo-uk'}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={compact ? 'flag-logo flag-logo-compact' : 'flag-logo'}
    >
      <span />
      <span />
      <span />
    </span>
  )
}

function Icon({ name }: { name: 'help' | 'stats' }) {
  const paths = {
    help: (
      <>
        <path d="M9.1 9a3 3 0 1 1 5.8 1.1c-.4 1.1-1.4 1.6-2.1 2.2-.6.5-.8.9-.8 1.7" />
        <path d="M12 17h.01" />
      </>
    ),
    stats: (
      <>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 15v-4" />
        <path d="M12 15V8" />
        <path d="M16 15v-6" />
      </>
    ),
  } as const

  return (
    <svg aria-hidden="true" className="button-icon" fill="none" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  )
}

function App() {
  const savedSettings = loadSettings()
  const [dialectId, setDialectId] = useState(savedSettings?.dialectId ?? dialectPacks[0].id)
  const [wordLength, setWordLength] = useState(savedSettings?.wordLength ?? 5)
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>(savedSettings?.uiLanguage ?? 'it')
  const [theme, setTheme] = useState<ThemeMode>(savedSettings?.theme ?? 'light')
  const [helpOpen, setHelpOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [dialectMenuOpen, setDialectMenuOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [currentGuessLetters, setCurrentGuessLetters] = useState(() => buildEmptyGuess(savedSettings?.wordLength ?? 5))
  const [activeCellIndex, setActiveCellIndex] = useState(0)
  const [revealRowIndex, setRevealRowIndex] = useState<number | null>(null)

  const t = copy[uiLanguage]
  const mode: GameMode = 'classic'
  const basePack = useMemo(() => getDialectById(dialectId), [dialectId])
  const selectedDialect = dialectPacks.find((dialect) => dialect.id === dialectId) ?? dialectPacks[0]
  const availableWordLengths = basePack.availableWordLengths.filter((length) => length >= 4)
  const selectedWordLength = availableWordLengths.includes(wordLength) ? wordLength : availableWordLengths[0] ?? 5
  const pack = useMemo(
    () => getDialectById(dialectId, selectedWordLength),
    [dialectId, selectedWordLength],
  )
  const [gameState, setGameState] = useState<DailyGameState>(() => createOrLoadDailyState(pack, mode))
  const stats = useMemo(() => loadStats(pack.id, pack.wordLength), [pack.id, pack.wordLength, gameState.status])
  const currentGuess = useMemo(() => currentGuessLetters.join(''), [currentGuessLetters])
  const keyboardRows = useMemo(() => buildKeyboardRows(pack.alphabet), [pack.alphabet])
  const allowedLetters = useMemo(
    () => new Set(pack.alphabet.map((item) => normalizeWord(item))),
    [pack.alphabet],
  )

  useEffect(() => {
    saveSettings({ dialectId, mode, wordLength: selectedWordLength, uiLanguage, theme })
  }, [dialectId, mode, selectedWordLength, uiLanguage, theme])

  useEffect(() => {
    if (selectedWordLength !== wordLength) {
      setWordLength(selectedWordLength)
    }
  }, [selectedWordLength, wordLength])

  useEffect(() => {
    const nextState = createOrLoadDailyState(pack, mode)
    setGameState(nextState)
    setCurrentGuessLetters(buildEmptyGuess(pack.wordLength))
    setActiveCellIndex(0)
    setResultOpen(nextState.status !== 'playing')
    setRevealRowIndex(null)
    setMessage('')
  }, [pack])

  useEffect(() => {
    if (!message || gameState.status !== 'playing') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setMessage('')
    }, 2200)

    return () => window.clearTimeout(timeoutId)
  }, [gameState.status, message])

  useEffect(() => {
    if (revealRowIndex === null) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setRevealRowIndex(null)
    }, 900)

    return () => window.clearTimeout(timeoutId)
  }, [revealRowIndex])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Enter') {
        event.preventDefault()
        void onSubmitGuess()
        return
      }

      if (event.key === 'Backspace') {
        event.preventDefault()
        removeLetter()
        return
      }

      if (/^\p{L}$/u.test(event.key) || /[\u0027\u2019\u0060\u00B4]/u.test(event.key)) {
        addLetter(event.key)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gameState, currentGuessLetters, activeCellIndex, allowedLetters, pack, t])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const answer = pack.answers.find((item) => item.word === gameState.answerWord)
  const usedLetters = useMemo(() => {
    const statusOrder: LetterStatus[] = ['absent', 'present', 'correct']
    const output: Record<string, LetterStatus> = {}

    for (const row of gameState.evaluations) {
      for (const tile of row) {
        const current = output[tile.letter]
        if (!current || statusOrder.indexOf(tile.status) > statusOrder.indexOf(current)) {
          output[tile.letter] = tile.status
        }
      }
    }

    return output
  }, [gameState.evaluations])

  function addLetter(letter: string) {
    const normalizedLetter = normalizeWord(letter)

    if (gameState.status !== 'playing' || !allowedLetters.has(normalizedLetter)) {
      return
    }

    setCurrentGuessLetters((value) => {
      const nextLetters = value.slice(0, pack.wordLength)
      nextLetters[activeCellIndex] = normalizedLetter
      return nextLetters
    })
    setActiveCellIndex((value) => Math.min(value + 1, pack.wordLength - 1))
  }

  function removeLetter() {
    if (gameState.status !== 'playing') {
      return
    }

    const nextLetters = currentGuessLetters.slice(0, pack.wordLength)
    let nextActiveCellIndex = activeCellIndex

    if (nextLetters[activeCellIndex]) {
      nextLetters[activeCellIndex] = ''
    } else {
      const previousIndex = Math.max(nextActiveCellIndex - 1, 0)
      nextLetters[previousIndex] = ''
      nextActiveCellIndex = previousIndex
    }

    setCurrentGuessLetters(nextLetters)
    setActiveCellIndex(nextActiveCellIndex)
  }

  async function onSubmitGuess() {
    if (gameState.status !== 'playing') {
      return
    }

    if (currentGuessLetters.some((letter) => !letter)) {
      setMessage(t.needsLetters(pack.wordLength))
      return
    }

    if (!canSubmitGuess(currentGuess, pack)) {
      setCurrentGuessLetters(buildEmptyGuess(pack.wordLength))
      setActiveCellIndex(0)
      setMessage(t.invalidGuess)
      return
    }

    const nextState = submitGuess(gameState, currentGuess)
    setGameState(nextState)
    setRevealRowIndex(nextState.evaluations.length - 1)
    persistState(nextState)
    setCurrentGuessLetters(buildEmptyGuess(pack.wordLength))
    setActiveCellIndex(0)

    if (nextState.status === 'won' || nextState.status === 'lost') {
      updateStatsForCompletedGame(pack.id, nextState)
      setMessage(nextState.status === 'won' ? t.wonMessage : t.lostMessage(nextState.answerWord))
      setResultOpen(true)
      return
    }

    setMessage('')
  }

  async function copyShare() {
    const text = buildShareText({
      pack,
      date: gameState.puzzleDate,
      evaluations: gameState.evaluations,
      won: gameState.status === 'won',
    })
    await navigator.clipboard.writeText(text)
    setMessage(t.copied)
  }

  function handleKeyboardPress(key: string) {
    if (key === 'ENTER') {
      void onSubmitGuess()
      return
    }
    if (key === 'BACKSPACE') {
      removeLetter()
      return
    }
    addLetter(key)
  }

  const gameHeaderControls = (
    <div className="game-controls">
      <button
        aria-label={t.help}
        className="ghost-button icon-button"
        onClick={() => setHelpOpen(true)}
        title={t.help}
        type="button"
      >
        <Icon name="help" />
      </button>
      <button
        aria-label={t.stats}
        className="ghost-button icon-button"
        onClick={() => setStatsOpen(true)}
        title={t.stats}
        type="button"
      >
        <Icon name="stats" />
      </button>
      <span className="toolbar-divider" />
      <button
        aria-label="Italiano"
        className={`toolbar-button ${uiLanguage === 'it' ? 'toolbar-button-active' : ''}`}
        onClick={() => setUiLanguage('it')}
        type="button"
      >
        <FlagLogo compact />
      </button>
      <button
        aria-label="English"
        className={`toolbar-button ${uiLanguage === 'en' ? 'toolbar-button-active' : ''}`}
        onClick={() => setUiLanguage('en')}
        type="button"
      >
        <FlagLogo compact variant="en" />
      </button>
      <button
        aria-label={t.theme}
        className="toolbar-button"
        onClick={() => setTheme((value) => (value === 'light' ? 'dark' : 'light'))}
        type="button"
      >
        {theme === 'light' ? '☾' : '☼'}
      </button>
    </div>
  )

  const brandHeader = (
    <div className="app-header">
      <div>
        <div className="brand-header">
          <FlagLogo />
          <h1>{t.title}</h1>
        </div>
        <p className="eyebrow">{appSubtitle}</p>
      </div>
      <div
        aria-atomic="true"
        aria-live="polite"
        className={`status-banner ${message ? '' : 'status-banner-empty'}`}
      >
        <span className="status-message" key={message}>
          {message}
        </span>
      </div>
      {gameHeaderControls}
    </div>
  )

  return (
    <main className="shell">
      <section className="page-card">
        {brandHeader}
        <div className="board-controls">
          <div
            className="control language-menu-control"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDialectMenuOpen(false)
              }
            }}
          >
            <span className="sr-only">{t.dialect}</span>
            <button
              aria-expanded={dialectMenuOpen}
              aria-haspopup="listbox"
              className="language-menu-trigger"
              onClick={() => setDialectMenuOpen((value) => !value)}
              type="button"
            >
              {selectedDialect.name}
            </button>
            {dialectMenuOpen ? (
              <div className="language-menu" role="listbox" aria-label={t.dialect}>
                {dialectPacks.map((dialect) => {
                  const selected = dialect.id === dialectId

                  return (
                    <button
                      aria-selected={selected}
                      className={`language-menu-option ${selected ? 'language-menu-option-selected' : ''}`}
                      key={dialect.id}
                      onClick={(event) => {
                        setDialectId(dialect.id)
                        setDialectMenuOpen(false)
                        event.currentTarget.blur()
                      }}
                      role="option"
                      type="button"
                    >
                      <span>{dialect.name}</span>
                      {selected ? <span aria-hidden="true" className="language-menu-check">✓</span> : null}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
          <div className="control length-picker">
            <span className="sr-only">{t.wordLength}</span>
            <div className="length-options" role="group" aria-label={t.wordLength}>
              {availableWordLengths.map((length) => (
                <button
                  aria-pressed={selectedWordLength === length}
                  className={`length-option ${selectedWordLength === length ? 'length-option-active' : ''}`}
                  key={length}
                  onClick={() => setWordLength(length)}
                  type="button"
                >
                  {length}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="board-wrap">
          <Grid
            activeCellIndex={activeCellIndex}
            canEdit={gameState.status === 'playing'}
            currentGuessLetters={currentGuessLetters}
            evaluations={gameState.evaluations}
            onCellClick={setActiveCellIndex}
            wordLength={pack.wordLength}
            revealRowIndex={revealRowIndex}
          />
        </div>

        <Keyboard
          rows={keyboardRows}
          usedLetters={usedLetters}
          enterLabel={t.enter}
          backspaceLabel={t.backspace}
          onKeyPress={handleKeyboardPress}
        />

      </section>

      {helpOpen ? (
        <Modal title={t.helpTitle} onClose={() => setHelpOpen(false)} closeLabel={t.close}>
          <p>{t.help1}</p>
          <p>{t.help2}</p>
          <p>{t.help3}</p>
          <div className="hero-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setHelpOpen(false)
                setSourcesOpen(true)
              }}
              type="button"
            >
              {t.sources}
            </button>
          </div>
        </Modal>
      ) : null}

      {sourcesOpen ? (
        <Modal title={t.sourceAttribution} onClose={() => setSourcesOpen(false)} closeLabel={t.close}>
          <p>{t.sourcesLead}</p>
          <div className="sources-grid">
            {dialectPacks.map((dialect) => {
              const lengthCounts = buildLengthCounts(dialect.id, dialect.availableWordLengths)
              const totalWords = lengthCounts.reduce((total, item) => total + item.count, 0)
              const displaySources = dedupeDisplaySources(dialect.sources)

              return (
                <article className="source-card" key={dialect.id}>
                  <div className="source-card-header">
                    <h3>{dialect.name}</h3>
                    <div className="source-card-total">
                      <strong>{totalWords.toLocaleString('it-IT')}</strong>
                      <span>{t.totalWords}</span>
                    </div>
                  </div>
                  <h4>{t.wordsByLength}</h4>
                  <div className="length-counts" aria-label={`${t.wordsByLength}: ${dialect.name}`}>
                    {lengthCounts.map((item) => (
                      <span key={item.length}>
                        <strong>{item.length}</strong>
                        {item.count.toLocaleString('it-IT')}
                      </span>
                    ))}
                  </div>
                  <h4>{t.sources}</h4>
                  <ul className="source-list">
                    {displaySources.map((source) => (
                      <li key={source.url}>
                        <a href={source.url} rel="noreferrer" target="_blank">
                          {source.label}
                        </a>
                        {source.license && dialect.id !== 'sardo' ? ` · ${source.license}` : ''}
                      </li>
                    ))}
                  </ul>
                </article>
              )
            })}
          </div>
          <p>
            {t.reportLabel}{' '}
            <a
              href="https://github.com/SimoneErba/dialettile/issues/new"
              rel="noreferrer"
              target="_blank"
            >
              GitHub Issues
            </a>
          </p>
        </Modal>
      ) : null}

      {statsOpen ? (
        <Modal title={t.statsTitle} onClose={() => setStatsOpen(false)} closeLabel={t.close}>
          <div className="stats-grid">
            <div><strong>{stats.played}</strong><span>{t.played}</span></div>
            <div><strong>{stats.won}</strong><span>{t.won}</span></div>
            <div><strong>{stats.currentStreak}</strong><span>{t.streak}</span></div>
            <div><strong>{stats.maxStreak}</strong><span>{t.maxStreak}</span></div>
          </div>
        </Modal>
      ) : null}

      {resultOpen && answer ? (
        <Modal
          title={gameState.status === 'won' ? t.winTitle : t.loseTitle}
          onClose={() => setResultOpen(false)}
          closeLabel={t.close}
          showCloseButton={false}
        >
          <div className="result-card compact-result">
            <p>
              <strong>{answer.word}</strong>
              {' · '}
              {answer.definition}
            </p>
            <a href={answer.sourceUrl} rel="noreferrer" target="_blank">
              {t.openSource}
            </a>
          </div>
          <div className="hero-actions">
            <button className="primary-button" onClick={copyShare} type="button">
              {t.share}
            </button>
            <button className="secondary-button" onClick={() => setResultOpen(false)} type="button">
              {t.keepPlaying}
            </button>
          </div>
        </Modal>
      ) : null}
    </main>
  )
}

export default App
