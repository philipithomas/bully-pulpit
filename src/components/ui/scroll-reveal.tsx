'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

export function ScrollReveal() {
  const pathname = usePathname()

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run observer on route change to animate new elements
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.reveal').forEach((el) => {
        el.classList.add('revealed')
      })
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement
            const index = Number(el.dataset.revealIndex ?? 0)
            setTimeout(() => {
              el.classList.add('revealed')
            }, index * 100)
            observer.unobserve(el)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )

    requestAnimationFrame(() => {
      document.querySelectorAll('.reveal:not(.revealed)').forEach((el, i) => {
        ;(el as HTMLElement).dataset.revealIndex = String(i % 3)
        observer.observe(el)
      })
    })

    return () => observer.disconnect()
  }, [pathname])

  return null
}
