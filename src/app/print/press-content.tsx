import Image from 'next/image'
import Link from 'next/link'
import { ArrowIcon } from '@/components/ui/arrow-icon'
import { PRINT_EDITION_STATUS_TEXT } from '@/lib/public-pages'

export function PressContent() {
  return (
    <div className="bg-offwhite-cool" data-bg="offwhite-cool">
      <div className="container">
        <div
          className="flex flex-col md:flex-row md:gap-8 lg:gap-12 py-8 items-center justify-center"
          style={{ minHeight: 'calc(100vh - 88px)' }}
        >
          <div className="w-full md:w-1/2 flex flex-col justify-center text-center md:text-left">
            <div className="max-w-2xl mx-auto md:mx-0">
              <h1 className="font-sans text-4xl sm:text-5xl font-semibold tracking-tight text-gray-950 leading-tight text-pretty">
                Print edition
              </h1>

              <p className="mt-4 md:mt-6 lg:mt-8 font-serif text-gray-600 text-lg sm:text-xl md:text-2xl text-pretty leading-relaxed">
                Every newsletter printed and mailed to you. Read each right
                away, or collect a stack for later screen-free perusing.
              </p>

              <div className="mt-8 space-y-6">
                <div className="border border-brass/50 bg-brass/10 px-4 py-3">
                  <p className="font-sans text-sm font-semibold text-gray-950">
                    This experiment has concluded
                  </p>
                  <p className="mt-1 font-serif text-sm text-gray-600 text-pretty leading-relaxed">
                    {PRINT_EDITION_STATUS_TEXT} The{' '}
                    <Link
                      href="/introducing-the-print-edition"
                      className="underline underline-offset-4 decoration-indigo hover:text-indigo transition-colors duration-300"
                    >
                      launch essay
                    </Link>{' '}
                    tells the full story.
                  </p>
                </div>

                <div className="grid gap-3 sm:flex sm:flex-wrap">
                  <button
                    type="button"
                    disabled
                    className="btn btn-indigo w-full sm:w-auto"
                  >
                    <span className="btn-text">$15/mo USA delivery</span>
                    <span className="btn-arrow">
                      <ArrowIcon className="w-4 h-4" />
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled
                    className="btn btn-indigo w-full sm:w-auto"
                  >
                    <span className="btn-text">$20/mo global</span>
                    <span className="btn-arrow">
                      <ArrowIcon className="w-4 h-4" />
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="hidden md:flex md:w-1/2 md:items-center md:justify-center">
            <div className="relative w-full" style={{ maxWidth: 450 }}>
              <div
                className="relative w-full"
                style={{ paddingBottom: '133.33%' }}
              >
                <Image
                  src="/images/paris-small.jpg"
                  alt="Laptop and cappuccino at Soho House Paris"
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 768px) 0vw, 50vw"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
