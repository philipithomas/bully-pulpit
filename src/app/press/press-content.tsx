import Image from 'next/image'
import Link from 'next/link'
import { ArrowIcon } from '@/components/ui/arrow-icon'

const STRIPE_CHECKOUT_USA = 'https://buy.stripe.com/00w4gB7P21zn0qVae19oc00'
const STRIPE_CHECKOUT_GLOBAL = 'https://buy.stripe.com/8x26oJedqb9X6Pjfyl9oc01'
const STRIPE_BILLING_PORTAL =
  'https://billing.stripe.com/p/login/00w4gB7P21zn0qVae19oc00'

export function PressContent() {
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

              <p className="mt-4 md:mt-6 lg:mt-8 font-serif text-gray-600 text-lg sm:text-xl md:text-2xl text-pretty leading-relaxed">
                Every newsletter printed and mailed to you. Read each right
                away, or collect a stack for later screen-free perusing.
              </p>

              <div className="mt-8 space-y-6">
                <div className="grid gap-3 sm:flex sm:flex-wrap">
                  <a
                    href={STRIPE_CHECKOUT_USA}
                    className="btn btn-indigo w-full sm:w-auto"
                  >
                    <span className="btn-text">$15/mo USA delivery</span>
                    <span className="btn-arrow">
                      <ArrowIcon className="w-4 h-4" />
                    </span>
                  </a>
                  <a
                    href={STRIPE_CHECKOUT_GLOBAL}
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
                  <a
                    href={STRIPE_BILLING_PORTAL}
                    className="underline underline-offset-4 decoration-gray-400 hover:text-gray-900 transition-colors duration-300"
                  >
                    Manage billing &amp; shipping
                  </a>
                </p>
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
