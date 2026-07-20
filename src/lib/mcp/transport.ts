import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'

const NO_AUTH_SECURITY_SCHEMES = [{ type: 'noauth' }] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function addOpenAiNoAuthExtension(message: JSONRPCMessage): JSONRPCMessage {
  if (!('result' in message) || !isRecord(message.result)) return message
  const tools = message.result.tools
  if (!Array.isArray(tools)) return message

  return {
    ...message,
    result: {
      ...message.result,
      tools: tools.map((tool) =>
        isRecord(tool)
          ? { ...tool, securitySchemes: NO_AUTH_SECURITY_SCHEMES }
          : tool
      ),
    },
  }
}

/**
 * OpenAI scans a top-level `securitySchemes` tool extension and its `_meta`
 * compatibility mirror. MCP SDK 1.x exposes only `_meta` through registerTool,
 * so add the top-level no-auth declaration as the response leaves the official
 * transport. Standard MCP clients ignore this extension.
 */
export class StoreCompatibleMcpTransport extends WebStandardStreamableHTTPServerTransport {
  override send(
    message: JSONRPCMessage,
    options?: TransportSendOptions
  ): Promise<void> {
    return super.send(addOpenAiNoAuthExtension(message), options)
  }
}
