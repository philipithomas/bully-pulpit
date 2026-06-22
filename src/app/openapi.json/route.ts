import {
  OPENAPI_HEADERS,
  openApiJson,
  publicOptions,
} from '@/lib/public-api/http'
import { openApiSpec } from '@/lib/public-api/openapi'

export function OPTIONS() {
  return publicOptions(OPENAPI_HEADERS)
}

export function GET() {
  return openApiJson(openApiSpec())
}
