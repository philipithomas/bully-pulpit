import { siteIdentity } from '@/lib/site-identity'

const nycCalendar = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'numeric',
  day: 'numeric',
  weekday: 'long',
  hour: 'numeric',
  hourCycle: 'h23',
})

/** One short opening, derived from the actual NYC calendar without a model call. */
export function phoneBellInitialGreeting(now = new Date()): string {
  const parts = nycCalendar.formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? ''
  const month = Number(value('month'))
  const day = Number(value('day'))
  const hour = Number(value('hour'))
  const weekday = value('weekday')

  let opening =
    hour >= 5 && hour < 12
      ? 'Good morning'
      : hour >= 12 && hour < 17
        ? 'Good afternoon'
        : 'Good evening'

  if (month === 1 && day === 1) opening = 'Happy New Year'
  else if (month === 7 && day === 4) opening = 'Happy Independence Day'
  else if (month === 9 && weekday === 'Monday' && day <= 7) {
    opening = 'Happy Labor Day'
  } else if (month === 11 && weekday === 'Thursday' && day >= 22 && day <= 28) {
    opening = 'Happy Thanksgiving'
  }

  const spokenName = siteIdentity.name.replace('Ilic', 'Eelitch')
  return `${opening}. You've reached ${spokenName} and the Contraption Company. This is Bell AI. You can ask me a question, leave a voicemail, or subscribe to new-post texts. Press star for keypad options.`
}
