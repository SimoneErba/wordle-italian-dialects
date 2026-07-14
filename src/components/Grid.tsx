import { EvaluationTile } from '../types'

interface GridProps {
  currentGuessLetters: string[]
  evaluations: EvaluationTile[][]
  wordLength: number
  activeCellIndex: number
  canEdit: boolean
  onCellClick: (index: number) => void
  revealRowIndex?: number | null
  maxRows?: number
}

function emptyRow(length: number): string[] {
  return Array.from({ length }, () => '')
}

export function Grid({
  currentGuessLetters,
  evaluations,
  wordLength,
  activeCellIndex,
  canEdit,
  onCellClick,
  revealRowIndex = null,
  maxRows = 6,
}: GridProps) {
  const rows = Array.from({ length: maxRows }, (_, rowIndex) => {
    const evaluation = evaluations[rowIndex]
    if (evaluation) {
      return evaluation.map((tile) => ({ value: tile.letter, status: tile.status }))
    }

    if (rowIndex === evaluations.length) {
      return currentGuessLetters
        .concat(emptyRow(Math.max(0, wordLength - currentGuessLetters.length)))
        .slice(0, wordLength)
        .map((value) => ({ value, status: 'pending' as const }))
    }

    return emptyRow(wordLength).map((value) => ({ value, status: 'empty' as const }))
  })

  return (
    <div className="grid" style={{ ['--word-length' as string]: String(wordLength) }}>
      {rows.map((row, rowIndex) => (
        <div className="grid-row" key={rowIndex}>
          {row.map((tile, tileIndex) => {
            const isCurrentRow = canEdit && rowIndex === evaluations.length
            const isActive = isCurrentRow && tileIndex === activeCellIndex
            const className = [
              'tile',
              `tile-${tile.status}`,
              isCurrentRow ? 'tile-clickable' : '',
              isActive ? 'tile-active' : '',
              revealRowIndex === rowIndex ? 'tile-reveal' : '',
            ].filter(Boolean).join(' ')
            const style =
              revealRowIndex === rowIndex
                ? ({ ['--reveal-delay' as string]: `${tileIndex * 120}ms` } as Record<string, string>)
                : undefined

            if (isCurrentRow) {
              return (
                <button
                  aria-label={`Cell ${tileIndex + 1}`}
                  className={className}
                  key={tileIndex}
                  onClick={() => onCellClick(tileIndex)}
                  style={style}
                  type="button"
                >
                  {tile.value}
                </button>
              )
            }

            return (
              <div className={className} key={tileIndex} style={style}>
                {tile.value}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
