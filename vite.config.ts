import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

declare const process: {
  env: Record<string, string | undefined>
}

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const isUserPagesRepository = repositoryName ? /\.github\.io$/.test(repositoryName) : false
const pagesBase = isUserPagesRepository ? '/' : `/${repositoryName}/`
const base = process.env.GITHUB_ACTIONS === 'true' && repositoryName ? pagesBase : '/'

export default defineConfig({
  base,
  plugins: [react()],
})
