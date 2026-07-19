import { handleSubscribeRequest } from '@/app/api/subscribe/handler'

/**
 * Compatibility for an Umami page left open during the Tidbits deployment.
 * A direct handler preserves the POST body and the path-bound BotID proof.
 */
export async function POST(request: Request) {
  return handleSubscribeRequest(request, { newsletters: ['tidbits'] })
}
