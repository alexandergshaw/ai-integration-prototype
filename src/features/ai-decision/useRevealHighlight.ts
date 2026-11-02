import { useCallback, useEffect, useRef, useState } from 'react'

export type RevealOptions = {
  /** Move keyboard focus to the destination. Defaults to false to avoid stealing focus. */
  focus?: boolean
  /** Vertical alignment passed to scrollIntoView. */
  block?: ScrollLogicalPosition
  /** Apply the temporary highlight. Defaults to true. */
  highlight?: boolean
}

export const HIGHLIGHT_CLASS = 'newly-revealed'
const HIGHLIGHT_MS = 1600
const ANNOUNCE_RESET_MS = 60
// The topbar is not sticky, but a small offset keeps revealed content clear of the viewport edge.
const TOP_OFFSET = 16

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isSufficientlyVisible(element: Element): boolean {
  if (typeof element.getBoundingClientRect !== 'function') return true
  const rect = element.getBoundingClientRect()
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
  return rect.top >= TOP_OFFSET && rect.top <= viewportHeight * 0.9
}

type RevealRequest = { token: number; name: string; options: RevealOptions }

/**
 * Reveal-and-highlight interaction for deliberate, user-triggered content changes.
 *
 * Register destinations with `targetRef(name)` (falling back to element ids), then call
 * `reveal(name)` from an action handler. After the committed render, the destination is
 * scrolled into view only when needed and given a brief, soft highlight. A superseding reveal
 * cancels the previous highlight, so stale or cancelled requests never flash old content.
 */
export function useRevealHighlight() {
  const registry = useRef(new Map<string, HTMLElement>())
  const refCallbacks = useRef(new Map<string, (element: HTMLElement | null) => void>())
  const highlighted = useRef<HTMLElement | null>(null)
  const highlightTimer = useRef<number | undefined>(undefined)
  const announceTimer = useRef<number | undefined>(undefined)
  const [request, setRequest] = useState<RevealRequest | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const tokenRef = useRef(0)

  const targetRef = useCallback((name: string) => {
    let callback = refCallbacks.current.get(name)
    if (!callback) {
      callback = (element: HTMLElement | null) => {
        if (element) registry.current.set(name, element)
        else registry.current.delete(name)
      }
      refCallbacks.current.set(name, callback)
    }
    return callback
  }, [])

  const reveal = useCallback((name: string, options: RevealOptions = {}) => {
    tokenRef.current += 1
    setRequest({ token: tokenRef.current, name, options })
  }, [])

  const announce = useCallback((message: string) => {
    window.clearTimeout(announceTimer.current)
    // Reset first so repeated identical messages are still re-announced.
    setAnnouncement('')
    announceTimer.current = window.setTimeout(() => setAnnouncement(message), ANNOUNCE_RESET_MS)
  }, [])

  useEffect(() => {
    if (!request) return
    let cancelled = false
    let frame = 0
    const run = () => {
      if (cancelled) return
      const element = registry.current.get(request.name) ?? document.getElementById(request.name)
      if (!element) return
      const reduced = prefersReducedMotion()
      const { focus = false, block = 'center', highlight = true } = request.options
      const active = document.activeElement
      const editingText = (active instanceof HTMLTextAreaElement) ||
        (active instanceof HTMLInputElement && active.type !== 'button' && active.type !== 'submit')
      // Avoid scrolling while the user is typing, unless this reveal explicitly takes focus.
      if (!editingText || focus) {
        if (!isSufficientlyVisible(element) && typeof element.scrollIntoView === 'function') {
          element.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block, inline: 'nearest' })
        }
      }
      if (focus && typeof element.focus === 'function') {
        element.focus({ preventScroll: true })
      }
      if (highlight) {
        window.clearTimeout(highlightTimer.current)
        if (highlighted.current && highlighted.current !== element) {
          highlighted.current.classList.remove(HIGHLIGHT_CLASS)
        }
        element.classList.add(HIGHLIGHT_CLASS)
        highlighted.current = element
        highlightTimer.current = window.setTimeout(() => {
          element.classList.remove(HIGHLIGHT_CLASS)
          if (highlighted.current === element) highlighted.current = null
        }, HIGHLIGHT_MS)
      }
    }
    frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : (run(), 0)
    return () => {
      cancelled = true
      if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
    }
  }, [request])

  useEffect(() => () => {
    window.clearTimeout(highlightTimer.current)
    window.clearTimeout(announceTimer.current)
  }, [])

  return { targetRef, reveal, announce, announcement }
}
