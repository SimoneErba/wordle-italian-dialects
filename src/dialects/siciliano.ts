import allWords from '../../data/wiktionary/siciliano/all-words.json'
import { buildPackFromDownloadedFiles } from './buildPack'

export function createSicilianoPack(wordLength = 5) {
  return buildPackFromDownloadedFiles({
  id: 'siciliano',
  name: 'Siciliano',
  area: 'Sicilia',
  locale: 'it-IT',
  wordLength,
  answersVersion: 'v3-scn-wiktionary-import',
  entries: allWords,
  })
}

export const sicilianoPack = createSicilianoPack()
