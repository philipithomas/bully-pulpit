import { handleSubscribeRequest } from '@/app/api/subscribe/handler'

export async function POST(request: Request) {
  return handleSubscribeRequest(request, { newsletters: ['tidbits'] })
}
