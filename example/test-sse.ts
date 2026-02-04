/**
 * SSE 端到端测试
 * 测试功能：
 * 1. GET SSE (带 query)
 * 2. POST SSE (带 body)
 * 3. DELETE SSE (带 body)
 * 4. POST SSE (body + query)
 * 5. 请求取消
 * 6. 自动重连
 * 
 * 使用方法：先启动 vafast 服务器，然后运行此测试
 */

import { createClient, eden } from '../src'
import type { ApiError } from '../src/types'

// 手动定义契约类型（用于演示）
type TestApi = {
  // GET SSE - 事件订阅
  events: {
    sse: {
      query: { channel: string }
      return: { message: string; timestamp: number }
    }
  }
  
  // POST SSE - AI 对话
  chat: {
    stream: {
      sse: {
        method: 'POST'
        body: { messages: Array<{ role: string; content: string }>; model?: string }
        return: { content?: string; done?: boolean }
      }
    }
  }
  
  // DELETE SSE - 批量删除进度
  batch: {
    delete: {
      sse: {
        method: 'DELETE'
        body: { ids: string[] }
        return: { deleted: number; total: number; current?: string }
      }
    }
  }
  
  // POST SSE with query - 搜索
  search: {
    sse: {
      method: 'POST'
      body: { query: string; filters?: Record<string, string> }
      query: { page: number; limit: number }
      return: { results: Array<{ id: string; title: string }>; hasMore: boolean }
    }
  }
  
  // 普通请求（用于对比）
  hello: {
    get: {
      query: { name?: string }
      return: { message: string }
    }
  }
}

async function main() {
  console.log('🚀 SSE 客户端测试\n')
  console.log('⚠️ 注意：此测试需要对应的服务端实现\n')
  
  // 创建客户端
  const client = createClient('http://localhost:3456')
  const api = eden<TestApi>(client)
  
  // ============= 示例 1: GET SSE (事件订阅) =============
  console.log('📘 示例 1: GET SSE - 事件订阅')
  console.log('```typescript')
  console.log(`api.events.sse(
  { channel: 'news' },
  { onMessage: (data) => console.log(data) }
)`)
  console.log('```\n')
  
  // ============= 示例 2: POST SSE (AI 对话) =============
  console.log('📘 示例 2: POST SSE - AI 对话')
  console.log('```typescript')
  console.log(`api.chat.stream.sse(
  { messages: [{ role: 'user', content: '你好' }], model: 'gpt-4' },
  {
    onMessage: (data) => {
      if (data.content) process.stdout.write(data.content)
      if (data.done) console.log('\\n[完成]')
    }
  },
  { method: 'POST' }  // 指定 POST 方法
)`)
  console.log('```\n')
  
  // ============= 示例 3: DELETE SSE (批量删除) =============
  console.log('📘 示例 3: DELETE SSE - 批量删除进度')
  console.log('```typescript')
  console.log(`api.batch.delete.sse(
  { ids: ['1', '2', '3', '4', '5'] },
  {
    onMessage: (data) => {
      console.log(\`删除进度: \${data.deleted}/\${data.total}\`)
      if (data.current) console.log(\`当前: \${data.current}\`)
    }
  },
  { method: 'DELETE' }
)`)
  console.log('```\n')
  
  // ============= 示例 4: POST SSE with query (搜索) =============
  console.log('📘 示例 4: POST SSE - 搜索 (body + query)')
  console.log('```typescript')
  console.log(`api.search.sse(
  { query: 'TypeScript', filters: { lang: 'zh' } },  // body
  {
    onMessage: (data) => {
      data.results.forEach(r => console.log(\`- \${r.title}\`))
      if (!data.hasMore) console.log('[搜索完成]')
    }
  },
  { 
    method: 'POST',
    query: { page: 1, limit: 10 }  // URL 查询参数
  }
)`)
  console.log('```\n')
  
  // ============= 示例 5: 取消订阅 =============
  console.log('📘 示例 5: 取消订阅')
  console.log('```typescript')
  console.log(`const sub = api.events.sse(
  { channel: 'live' },
  { onMessage: console.log }
)

// 稍后取消
setTimeout(() => sub.unsubscribe(), 5000)`)
  console.log('```\n')
  
  // ============= 示例 6: 重连选项 =============
  console.log('📘 示例 6: 重连选项')
  console.log('```typescript')
  console.log(`api.events.sse(
  { channel: 'important' },
  {
    onMessage: console.log,
    onReconnect: (attempt, max) => console.log(\`重连 \${attempt}/\${max}\`),
    onMaxReconnects: () => console.log('重连失败')
  },
  {
    reconnectInterval: 3000,  // 重连间隔 3 秒
    maxReconnects: 5          // 最多重连 5 次
  }
)`)
  console.log('```\n')
  
  // ============= 类型定义示例 =============
  console.log('📘 服务端路由定义示例')
  console.log('```typescript')
  console.log(`// vafast 服务端
defineRoute({
  method: 'SSE',
  path: '/chat/stream',
  schema: {
    body: Type.Object({
      messages: Type.Array(Type.Object({
        role: Type.String(),
        content: Type.String()
      })),
      model: Type.Optional(Type.String())
    })
  },
  handler: async function* ({ body }) {
    for await (const chunk of ai.stream(body.messages)) {
      yield { content: chunk }
    }
    yield { done: true }
  }
})`)
  console.log('```\n')
  
  console.log('✅ API 示例展示完成!')
  console.log('💡 提示：需要对应的服务端实现才能实际运行这些示例')
}

main().catch(console.error)
