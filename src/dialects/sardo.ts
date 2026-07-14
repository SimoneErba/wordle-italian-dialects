import allWords from '../../data/ditzionariu/sardo/all-words.json'
import { buildPackFromDownloadedFiles } from './buildPack'

export function createSardoPack(wordLength = 5) {
  return buildPackFromDownloadedFiles({
  id: 'sardo',
  name: 'Sardo',
  area: 'Sardegna',
  locale: 'it-IT',
  wordLength,
  answersVersion: 'v1-ditzionariu-import',
  entries: allWords,
  })
}

export const sardoPack = createSardoPack()
