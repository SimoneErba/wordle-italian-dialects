import allWords from '../../data/wiktionary/veneto/all-words.json'
import { buildPackFromDownloadedFiles } from './buildPack'

export function createVenetoPack(wordLength = 5) {
  return buildPackFromDownloadedFiles({
  id: 'veneto',
  name: 'Veneto',
  area: 'Veneto',
  locale: 'it-IT',
  wordLength,
  answersVersion: 'v3-vec-wiktionary-import',
  entries: allWords,
  })
}

export const venetoPack = createVenetoPack()
