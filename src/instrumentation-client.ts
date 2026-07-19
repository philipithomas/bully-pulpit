import { initBotId } from 'botid/client/core'

// Routes BotID protects. The client attaches proof to fetches hitting these paths;
// the matching server handlers verify it with checkBotId(). Using Basic mode (free
// challenge-integrity validation); Deep Analysis was disabled after it produced
// false-positive 403s for real users on the sign-in/subscribe flows.
initBotId({
  protect: [
    {
      path: '/api/subscribe',
      method: 'POST',
    },
    {
      path: '/api/subscribe/tsundoku',
      method: 'POST',
    },
    {
      path: '/api/subscribe/tidbits',
      method: 'POST',
    },
    {
      path: '/api/auth/google',
      method: 'POST',
    },
    {
      path: '/api/auth/verify',
      method: 'POST',
    },
    {
      path: '/api/chat',
      method: 'POST',
    },
  ],
})
