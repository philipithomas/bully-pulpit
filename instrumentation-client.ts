import { initBotId } from 'botid/client/core'

initBotId({
  protect: [
    { path: '/api/chat', method: 'POST' },
    { path: '/api/subscribe', method: 'POST' },
    { path: '/api/auth/verify', method: 'POST' },
    { path: '/api/verify', method: 'POST' },
  ],
})
