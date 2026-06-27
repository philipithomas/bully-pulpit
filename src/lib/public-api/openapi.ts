import { siteConfig } from '@/lib/config'
import {
  DEFAULT_LIST_LIMIT,
  DEFAULT_SEARCH_LIMIT,
  MAX_LIST_LIMIT,
  MAX_SEARCH_LIMIT,
} from '@/lib/public-api/posts'

export function openApiSpec() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'philipithomas.com public API',
      version: '1.0.0',
      description:
        'Read-only, no-auth access to published posts on philipithomas.com.',
    },
    servers: [{ url: siteConfig.url }],
    security: [],
    tags: [
      {
        name: 'Posts',
        description:
          'Published writing from Contraption, Workshop, and Postcard.',
      },
    ],
    paths: {
      '/api/public/posts': {
        get: {
          tags: ['Posts'],
          operationId: 'listPosts',
          summary: 'List posts',
          description:
            'List published posts, newest first. Responses use opaque cursor pagination.',
          security: [],
          parameters: [
            {
              name: 'newsletter',
              in: 'query',
              required: false,
              description: 'Limit results to one newsletter.',
              schema: { $ref: '#/components/schemas/Newsletter' },
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              description: 'Maximum posts to return.',
              schema: {
                type: 'integer',
                minimum: 1,
                maximum: MAX_LIST_LIMIT,
                default: DEFAULT_LIST_LIMIT,
              },
            },
            {
              name: 'cursor',
              in: 'query',
              required: false,
              description:
                'Opaque cursor from a previous response. Reuse it with the same filter.',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'A page of posts.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['posts', 'pagination'],
                    properties: {
                      posts: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/PostSummary' },
                      },
                      pagination: {
                        $ref: '#/components/schemas/Pagination',
                      },
                    },
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/InvalidRequest' },
          },
        },
      },
      '/api/public/search': {
        get: {
          tags: ['Posts'],
          operationId: 'searchPosts',
          summary: 'Search posts',
          description:
            'Search published posts with local hybrid BM25/vector search. Returns metadata, scores, and excerpts.',
          security: [],
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              description: 'Search query.',
              schema: { type: 'string', minLength: 2 },
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              description: 'Maximum results to return.',
              schema: {
                type: 'integer',
                minimum: 1,
                maximum: MAX_SEARCH_LIMIT,
                default: DEFAULT_SEARCH_LIMIT,
              },
            },
            {
              name: 'cursor',
              in: 'query',
              required: false,
              description:
                'Opaque cursor from a previous response. Reuse it with the same query.',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'A page of search results.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['query', 'results', 'pagination'],
                    properties: {
                      query: { type: 'string' },
                      results: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/SearchResult' },
                      },
                      pagination: {
                        $ref: '#/components/schemas/Pagination',
                      },
                    },
                  },
                },
              },
            },
            '400': { $ref: '#/components/responses/InvalidRequest' },
          },
        },
      },
      '/api/public/posts/{slug}': {
        get: {
          tags: ['Posts'],
          operationId: 'readPost',
          summary: 'Read post',
          description:
            'Read one published post by slug. The response includes metadata, heading anchors, and the full MDX body.',
          security: [],
          parameters: [
            {
              name: 'slug',
              in: 'path',
              required: true,
              description: 'Post slug.',
              schema: { type: 'string', minLength: 1 },
            },
          ],
          responses: {
            '200': {
              description: 'A post with its full MDX body.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PostDetail' },
                },
              },
            },
            '404': { $ref: '#/components/responses/NotFound' },
          },
        },
      },
    },
    components: {
      schemas: {
        Newsletter: {
          type: 'string',
          enum: ['contraption', 'workshop', 'postcard'],
        },
        Pagination: {
          type: 'object',
          required: ['limit', 'total', 'nextCursor'],
          properties: {
            limit: { type: 'integer', minimum: 1 },
            total: { type: 'integer', minimum: 0 },
            nextCursor: { type: ['string', 'null'] },
          },
        },
        PostSummary: {
          type: 'object',
          required: [
            'slug',
            'url',
            'newsletter',
            'title',
            'subtitle',
            'description',
            'publishedAt',
            'coverImage',
            'coverImageAlt',
            'excerpt',
          ],
          properties: {
            slug: { type: 'string' },
            url: { type: 'string', format: 'uri' },
            newsletter: { $ref: '#/components/schemas/Newsletter' },
            title: { type: 'string' },
            subtitle: { type: ['string', 'null'] },
            description: { type: ['string', 'null'] },
            publishedAt: { type: 'string', format: 'date' },
            coverImage: { type: ['string', 'null'], format: 'uri' },
            coverImageAlt: { type: ['string', 'null'] },
            excerpt: { type: 'string' },
          },
        },
        SearchResult: {
          type: 'object',
          required: [
            'slug',
            'title',
            'url',
            'newsletter',
            'coverImage',
            'score',
            'publishedAt',
            'description',
            'excerpts',
          ],
          properties: {
            slug: { type: 'string' },
            title: { type: 'string' },
            url: { type: 'string', format: 'uri' },
            newsletter: { $ref: '#/components/schemas/Newsletter' },
            coverImage: { type: ['string', 'null'], format: 'uri' },
            score: { type: 'number' },
            publishedAt: { type: ['string', 'null'], format: 'date' },
            description: { type: ['string', 'null'] },
            excerpts: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
        Heading: {
          type: 'object',
          required: ['heading', 'anchor', 'url'],
          properties: {
            heading: { type: 'string' },
            anchor: { type: 'string' },
            url: { type: 'string', format: 'uri' },
          },
        },
        PostDetail: {
          allOf: [
            { $ref: '#/components/schemas/PostSummary' },
            {
              type: 'object',
              required: ['outline', 'content'],
              properties: {
                outline: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Heading' },
                },
                content: { type: 'string' },
              },
            },
          ],
        },
        ErrorResponse: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        InvalidRequest: {
          description: 'The request parameters are invalid.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        NotFound: {
          description: 'No matching post was found.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
    },
  }
}
