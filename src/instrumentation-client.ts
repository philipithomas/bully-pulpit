import { initBotId } from 'botid/client/core'

// Routes BotID protects. The client attaches proof to fetches hitting these paths;
// the matching server handlers verify it with checkBotId(). Deep Analysis (Pro) runs
// the stronger ML check against scraping, credential stuffing, and spam.
initBotId({
  protect: [
    {
      path: '/api/subscribe',
      method: 'POST',
      advancedOptions: { checkLevel: 'deepAnalysis' },
    },
    {
      path: '/api/auth/google',
      method: 'POST',
      advancedOptions: { checkLevel: 'deepAnalysis' },
    },
    {
      path: '/api/auth/verify',
      method: 'POST',
      advancedOptions: { checkLevel: 'deepAnalysis' },
    },
    {
      path: '/api/chat',
      method: 'POST',
      advancedOptions: { checkLevel: 'deepAnalysis' },
    },
  ],
})
