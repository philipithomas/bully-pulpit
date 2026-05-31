import { initBotId } from 'botid/client/core'

// BotID protects only the chat endpoint. It was removed from the auth and subscribe
// flows because its client challenge was not reliably ready for those early and
// popup-based requests, so checkBotId() failed closed and returned false-positive
// 403s for real users. Those routes are gated by Google OAuth / OTP and Firewall
// rate limiting instead.
initBotId({
  protect: [
    {
      path: '/api/chat',
      method: 'POST',
      advancedOptions: { checkLevel: 'deepAnalysis' },
    },
  ],
})
