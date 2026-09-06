'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { type ChangeEvent, useCallback, useEffect, useId, useMemo } from 'react'
import {
  drawerHref,
  isDrawerDate,
  MIN_DRAWER_DATE,
  resolveDrawerDate,
  selectDrawer,
  shiftDrawerDate,
  surpriseDrawerDate,
  utcIsoDate,
} from '@/lib/drawer/selection'
import type {
  DrawerCatalog,
  DrawerCategory,
  DrawerItem,
} from '@/lib/drawer/types'

const categoryLabels: Record<DrawerCategory, string> = {
  writing: 'From the archive',
  photograph: 'Photograph',
  diction: 'Diction',
  contraption: 'Contraptions',
  blogroll: 'Elsewhere',
}

function ItemLink({
  item,
  children,
}: {
  item: DrawerItem
  children: React.ReactNode
}) {
  const className = 'group block h-full'

  if (!item.href) return <div className="h-full">{children}</div>
  if (item.external) {
    return (
      <a href={item.href} className={className}>
        {children}
      </a>
    )
  }
  return (
    <Link href={item.href} className={className}>
      {children}
    </Link>
  )
}

function Compartment({ item, index }: { item: DrawerItem; index: number }) {
  const isPhotograph = item.category === 'photograph'
  const isLarge = item.category === 'writing' || isPhotograph

  return (
    <li
      data-drawer-category={item.category}
      className={`min-w-0 border-gray-300 border-r border-b ${isLarge ? 'md:col-span-3' : 'md:col-span-2'}`}
    >
      <article className="h-full bg-offwhite-light">
        <ItemLink item={item}>
          <div className="flex h-full flex-col">
            {isPhotograph && item.image ? (
              <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                <Image
                  src={item.image.src}
                  alt={item.image.alt}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.015] motion-reduce:transform-none"
                  priority
                />
              </div>
            ) : null}

            <div
              className={`flex flex-1 flex-col ${isLarge ? 'p-6 sm:p-8' : 'p-6'}`}
            >
              <div className="mb-8 flex items-baseline justify-between gap-4 font-sans text-xs text-gray-500">
                <span>{categoryLabels[item.category]}</span>
                <span aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>

              <div className="mt-auto">
                {item.publishedAt ? (
                  <time
                    dateTime={item.publishedAt}
                    className="mb-2 block font-sans text-xs text-gray-500"
                  >
                    {item.publishedAt}
                  </time>
                ) : null}
                <h3
                  className={`${item.category === 'diction' || item.category === 'contraption' ? 'font-serif text-3xl sm:text-4xl' : 'font-sans text-xl sm:text-2xl'} font-semibold tracking-tight text-gray-950 transition-colors duration-300 group-hover:text-forest`}
                >
                  {item.title}
                </h3>
                <p className="mt-3 max-w-2xl font-serif text-base leading-relaxed text-gray-600 sm:text-lg">
                  {item.description}
                </p>
                {item.href ? (
                  <span className="mt-6 inline-flex items-center gap-2 font-sans text-sm font-semibold text-gray-900">
                    {item.sourceLabel ?? 'Open'}
                    <span aria-hidden="true">↗</span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </ItemLink>
      </article>
    </li>
  )
}

export function DrawerClient({ catalog }: { catalog: DrawerCatalog }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const dateHeadingId = useId()
  const today = useMemo(() => utcIsoDate(new Date()), [])
  const earliestDate = catalog.earliestDate ?? MIN_DRAWER_DATE
  const requestedDate = searchParams.get('date')
  const date = resolveDrawerDate(requestedDate, today, earliestDate)
  const selection = useMemo(() => selectDrawer(catalog, date), [catalog, date])
  const canGoPrevious = date > earliestDate
  const previousDate = canGoPrevious ? shiftDrawerDate(date, -1) : null
  const canGoNext = date < today
  const nextDate = canGoNext ? shiftDrawerDate(date, 1) : null

  useEffect(() => {
    if (requestedDate !== date) {
      router.replace(drawerHref(date), { scroll: false })
    }
  }, [date, requestedDate, router])

  const navigateToDate = useCallback(
    (next: string) => {
      router.push(drawerHref(next), { scroll: false })
    },
    [router]
  )

  const surprise = useCallback(() => {
    navigateToDate(
      surpriseDrawerDate(date, today, catalog.earliestDate ?? today)
    )
  }, [catalog.earliestDate, date, navigateToDate, today])

  const handleDateChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (isDrawerDate(event.target.value)) {
        navigateToDate(event.target.value)
      }
    },
    [navigateToDate]
  )

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 border-gray-300 border-y py-4 sm:flex-row sm:items-center sm:justify-between">
        <nav
          aria-label="Drawer date navigation"
          className="flex items-center gap-4"
        >
          {previousDate ? (
            <Link
              href={drawerHref(previousDate)}
              scroll={false}
              className="font-sans text-sm font-semibold text-gray-700 transition-colors hover:text-gray-950"
              aria-label={`Previous drawer, ${previousDate}`}
            >
              ← Previous
            </Link>
          ) : (
            <span
              className="font-sans text-sm font-semibold text-gray-400"
              aria-label="Previous drawer unavailable"
            >
              ← Previous
            </span>
          )}
          {nextDate ? (
            <Link
              href={drawerHref(nextDate)}
              scroll={false}
              className="font-sans text-sm font-semibold text-gray-700 transition-colors hover:text-gray-950"
              aria-label={`Next drawer, ${nextDate}`}
            >
              Next →
            </Link>
          ) : (
            <span
              className="font-sans text-sm font-semibold text-gray-400"
              aria-label="Next drawer unavailable"
            >
              Next →
            </span>
          )}
        </nav>

        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <label className="flex items-center gap-2 font-sans text-sm text-gray-600">
            <span>Drawer date</span>
            <input
              type="date"
              value={date}
              min={earliestDate}
              max={today}
              onChange={handleDateChange}
              className="h-10 border border-gray-300 bg-offwhite-light px-3 font-sans text-sm text-gray-900"
            />
          </label>
          <button
            type="button"
            onClick={surprise}
            className="h-10 border border-gray-950 bg-gray-950 px-4 font-sans text-sm font-semibold text-white transition-colors hover:bg-gray-800"
          >
            Surprise me
          </button>
        </div>
      </div>

      <section
        aria-labelledby={dateHeadingId}
        aria-live="polite"
        data-drawer-date={date}
      >
        <h2
          id={dateHeadingId}
          className="mb-5 font-serif text-2xl text-gray-950 sm:text-3xl"
        >
          <time dateTime={date}>{date}</time>
        </h2>

        <ol className="grid grid-cols-1 border-gray-300 border-t border-l md:grid-cols-6">
          {selection.items.map((item, index) => (
            <Compartment key={`${date}:${item.id}`} item={item} index={index} />
          ))}
        </ol>
      </section>
    </>
  )
}
