/**
 * localStorage-backed "last student reviewed" so the dashboard can surface
 * a "Continue where you left off" card.
 */
const KEY = 'ee.lastReviewed'

export interface LastReviewed {
  jobId: string
  studentId: string
  examTitle: string
  studentName: string
  ts: string
}

export function saveLastReviewed(entry: LastReviewed): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entry))
  } catch {
    /* quota or disabled */
  }
}

export function loadLastReviewed(): LastReviewed | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as LastReviewed
  } catch {
    return null
  }
}
