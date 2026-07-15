import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string
  // ReactNode so loading states can pass a skeleton line.
  description?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-sans font-semibold text-3xl text-gray-950 tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl font-serif text-base text-gray-600 leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      {children ? (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      ) : null}
    </div>
  )
}
