'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowIcon } from '@/components/ui/arrow-icon'
import { useAuth } from '@/hooks/use-auth'

const STRIPE_CHECKOUT_USA = 'https://buy.stripe.com/00w4gB7P21zn0qVae19oc00'
const STRIPE_CHECKOUT_GLOBAL = 'https://buy.stripe.com/8x26oJedqb9X6Pjfyl9oc01'
const STRIPE_BILLING_PORTAL =
  'https://billing.stripe.com/p/login/00w4gB7P21zn0qVae19oc00'

function checkoutUrl(base: string, email?: string | null) {
  if (!email) return base
  const url = new URL(base)
  url.searchParams.set('prefilled_email', email)
  return url.toString()
}

function billingUrl(email?: string | null) {
  if (!email) return STRIPE_BILLING_PORTAL
  const url = new URL(STRIPE_BILLING_PORTAL)
  url.searchParams.set('prefilled_email', email)
  return url.toString()
}

export function PressContent() {
  const { user } = useAuth()

  return (
    <div className="bg-offwhite-cool">
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

              {user ? (
                <>
                  <p className="mt-4 md:mt-6 font-serif text-gray-600 text-lg sm:text-xl leading-relaxed text-pretty">
                    New essays are printed and mailed as they are published.
                    Allow about one week for USA delivery, two weeks globally.
                  </p>

                  <div className="mt-8 space-y-6">
                    <div className="border-t border-gray-200 pt-6 space-y-4">
                      <div>
                        <h2 className="font-sans text-xs font-semibold tracking-[0.15em] uppercase text-gray-500 mb-2">
                          Subscriber perk
                        </h2>
                        <p className="font-serif text-base text-gray-700 leading-relaxed">
                          Free Postcard premium — use code{' '}
                          <span className="inline-flex items-center px-2 py-0.5 bg-white border border-gray-200 text-gray-900 font-mono text-xs tracking-wide">
                            ESPRESSO
                          </span>
                        </p>
                      </div>
                      <div className="pt-2">
                        <h2 className="font-sans text-xs font-semibold tracking-[0.15em] uppercase text-gray-500 mb-2">
                          Support
                        </h2>
                        <p className="font-serif text-base text-gray-700 leading-relaxed">
                          <a
                            href="mailto:philip@contraption.co"
                            className="underline decoration-gray-400 hover:text-gray-900 transition-colors duration-300"
                          >
                            philip@contraption.co
                          </a>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <a
                        href={billingUrl(user.email)}
                        className="btn btn-indigo"
                      >
                        <span className="btn-text">Billing &amp; shipping</span>
                        <span className="btn-arrow">
                          <ArrowIcon className="w-4 h-4" />
                        </span>
                      </a>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-4 md:mt-6 lg:mt-8 font-serif text-gray-600 text-lg sm:text-xl md:text-2xl text-pretty leading-relaxed">
                    Get every new Contraption essay printed and mailed to you.
                    Read each right away, or collect a stack for later
                    screen-free perusing.
                  </p>

                  <div className="mt-8 space-y-6">
                    <div className="grid gap-3 sm:flex sm:flex-wrap">
                      <a
                        href={checkoutUrl(STRIPE_CHECKOUT_USA, null)}
                        className="btn btn-indigo w-full sm:w-auto"
                      >
                        <span className="btn-text">$15/mo USA delivery</span>
                        <span className="btn-arrow">
                          <ArrowIcon className="w-4 h-4" />
                        </span>
                      </a>
                      <a
                        href={checkoutUrl(STRIPE_CHECKOUT_GLOBAL, null)}
                        className="btn btn-indigo w-full sm:w-auto"
                      >
                        <span className="btn-text">$20/mo global</span>
                        <span className="btn-arrow">
                          <ArrowIcon className="w-4 h-4" />
                        </span>
                      </a>
                    </div>

                    <p className="text-sm text-gray-600">
                      Already subscribed?{' '}
                      <Link
                        href="/account"
                        className="underline underline-offset-4 decoration-gray-400 hover:text-gray-900 transition-colors duration-300"
                      >
                        Sign in
                      </Link>
                    </p>
                  </div>
                </>
              )}
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
