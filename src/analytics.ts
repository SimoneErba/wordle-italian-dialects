import posthog from 'posthog-js'

const POSTHOG_PROJECT_API_KEY = 'phc_Cke8VNUGFWiYGJePxTwI4GcwUZqDN03mDI2mqDgZjtC'
const POSTHOG_API_HOST = 'https://eu.i.posthog.com'

let initialized = false

export function initAnalytics() {
  if (initialized || typeof window === 'undefined') {
    return
  }

  initialized = true

  posthog.init(POSTHOG_PROJECT_API_KEY, {
    api_host: POSTHOG_API_HOST,
    capture_pageview: true,
    person_profiles: 'identified_only',
  })

  posthog.register({ project: 'wordle' })
}

export { posthog }
