/**
 * SSE 测试服务端
 * 
 * 运行: npx tsx example/sse-server.ts
 */

import { Server, defineRoute, defineRoutes, Type, serve } from '../../vafast/src'

const routes = defineRoutes([
  // GET SSE - 事件订阅
  defineRoute({
    method: 'GET',
    path: '/events',
    sse: true,
    schema: {
      query: Type.Object({
        channel: Type.String(),
      }),
    },
    handler: async function* ({ query }) {
      console.log(`[GET SSE] /events?channel=${query.channel}`)
      for (let i = 0; i < 3; i++) {
        yield { data: { channel: query.channel, index: i, time: Date.now() } }
        await new Promise(r => setTimeout(r, 500))
      }
      yield { data: { done: true } }
    },
  }),

  // POST SSE - AI 对话模拟
  defineRoute({
    method: 'POST',
    path: '/chat/stream',
    sse: true,
    schema: {
      body: Type.Object({
        messages: Type.Array(Type.Object({
          role: Type.String(),
          content: Type.String(),
        })),
        model: Type.Optional(Type.String()),
      }),
    },
    handler: async function* ({ body }) {
      console.log(`[POST SSE] /chat/stream`, { model: body.model, messageCount: body.messages.length })

      const lastMessage = body.messages[body.messages.length - 1]?.content || ''
      const response = `收到你的消息: "${lastMessage}"。这是一个流式响应测试。`

      // 模拟流式输出
      for (const char of response) {
        yield { data: { content: char } }
        await new Promise(r => setTimeout(r, 30))
      }
      yield { data: { done: true } }
    },
  }),

  // DELETE SSE - 批量删除
  defineRoute({
    method: 'DELETE',
    path: '/batch/delete',
    sse: true,
    schema: {
      body: Type.Object({
        ids: Type.Array(Type.String()),
      }),
    },
    handler: async function* ({ body }) {
      console.log(`[DELETE SSE] /batch/delete`, { ids: body.ids })

      const total = body.ids.length
      for (let i = 0; i < total; i++) {
        yield { data: { deleted: i + 1, total, current: body.ids[i] } }
        await new Promise(r => setTimeout(r, 300))
      }
      yield { data: { done: true, deleted: total, total } }
    },
  }),

  // 健康检查
  defineRoute({
    method: 'GET',
    path: '/health',
    handler: () => ({ status: 'ok', time: Date.now() }),
  }),

  // GET SSE with params - 房间消息订阅
  defineRoute({
    method: 'GET',
    path: '/rooms/:roomId/messages',
    sse: true,
    schema: {
      params: Type.Object({
        roomId: Type.String(),
      }),
      query: Type.Object({
        since: Type.Optional(Type.String()),
      }),
    },
    handler: async function* ({ params, query }) {
      console.log(`[GET SSE] /rooms/${params.roomId}/messages`, { since: query.since })
      for (let i = 0; i < 3; i++) {
        yield { data: { roomId: params.roomId, message: `消息 ${i}`, since: query.since } }
        await new Promise(r => setTimeout(r, 300))
      }
      yield { data: { done: true } }
    },
  }),

  // POST SSE with body + query
  defineRoute({
    method: 'POST',
    path: '/search',
    sse: true,
    schema: {
      body: Type.Object({
        keyword: Type.String(),
        filters: Type.Optional(Type.Record(Type.String(), Type.String())),
      }),
      query: Type.Object({
        page: Type.String(),   // URL query 参数是字符串
        limit: Type.String(),
      }),
    },
    handler: async function* ({ body, query }) {
      const page = parseInt(query.page, 10)
      const limit = parseInt(query.limit, 10)
      console.log(`[POST SSE] /search`, { body, page, limit })
      for (let i = 0; i < limit; i++) {
        yield { 
          data: { 
            keyword: body.keyword,
            page,
            index: i,
            result: `结果 ${page}-${i}` 
          } 
        }
        await new Promise(r => setTimeout(r, 200))
      }
      yield { data: { done: true, total: limit } }
    },
  }),
])

const server = new Server(routes)

const port = 3456

serve({
  fetch: server.fetch,
  port,
})

console.log(`🚀 SSE 测试服务启动: http://localhost:${port}`)
console.log(`
可用端点:
  GET  /health                      - 健康检查
  GET  /events?channel=xxx          - GET SSE (query)
  POST /chat/stream                 - POST SSE (body)
  DELETE /batch/delete              - DELETE SSE (body)
  GET  /rooms/:roomId/messages      - GET SSE (params + query)
  POST /search?page=1&limit=10      - POST SSE (body + query)
`)
