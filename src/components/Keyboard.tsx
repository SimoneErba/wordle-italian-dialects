import { LetterStatus } from '../types'

interface KeyboardProps {
  rows: string[][]
  usedLetters: Record<string, LetterStatus>
  enterLabel: string
  backspaceLabel: string
  onKeyPress: (key: string) => void
}

export function Keyboard({
  rows,
  usedLetters,
  enterLabel,
  backspaceLabel,
  onKeyPress,
}: KeyboardProps) {
  return (
    <div className="keyboard">
      {rows.map((row, index) => (
        <div className="keyboard-row" key={index}>
          {row.map((key) => (
            <button
              className={`key key-${usedLetters[key.toLowerCase()] ?? 'idle'}`}
              key={key}
              onClick={() => onKeyPress(key)}
              type="button"
            >
              {key}
            </button>
          ))}
          {index === rows.length - 1 ? (
            <>
              <button className="key key-wide" onClick={() => onKeyPress('ENTER')} type="button">
                {enterLabel}
              </button>
              <button className="key key-wide" onClick={() => onKeyPress('BACKSPACE')} type="button">
                {backspaceLabel}
              </button>
            </>
          ) : null}
        </div>
      ))}
    </div>
  )
}
