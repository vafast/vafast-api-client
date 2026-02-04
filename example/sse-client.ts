/**
 * SSE 客户端测试
 * 
 * 先启动服务端: npx tsx example/sse-server.ts
 * 再运行客户端: npx tsx example/sse-client.ts
 */

import { createClient, eden } from '../src'

// 定义 API 类型
type TestApi = {
  health: {
    get: { return: { status: string; time: number } }
  }
  events: {
    sse: { query: { channel: string }; return: { channel?: string; index?: number; done?: boolean } }
  }
  chat: {
    stream: {
      sse: {
        method: 'POST'
        body: { messages: Array<{ role: string; content: string }>; model?: string }
        return: { content?: string; done?: boolean }
      }
    }
  }
  batch: {
    delete: {
      sse: {
        method: 'DELETE'
        body: { ids: string[] }
        return: { deleted: number; total: number; current?: string; done?: boolean }
      }
    }
  }
  // params + query
  rooms: {
    ':id': {
      messages: {
        sse: { 
          query: { since?: string }
          return: { roomId?: string; message?: string; since?: string; done?: boolean }
        }
      }
    }
  }
  // body + query
  search: {
    sse: {
      method: 'POST'
      body: { keyword: string; filters?: Record<string, string> }
      query: { page: number; limit: number }
      return: { keyword?: string; page?: number; index?: number; result?: string; done?: boolean; total?: number }
    }
  }
}

async function main() {
  console.log('🧪 SSE 客户端测试\n')
  
  const client = createClient('http://localhost:3456')
  const api = eden<TestApi>(client)
  
  // 测试健康检查
  console.log('1️⃣ 健康检查')
  const { data: health, error: healthErr } = await api.health.get()
  if (healthErr) {
    console.error('❌ 服务未启动，请先运行: npx tsx example/sse-server.ts')
    process.exit(1)
  }
  console.log('   ✅', health)
  console.log()
  
  // 测试 GET SSE
  console.log('2️⃣ GET SSE - 事件订阅')
  await new Promise<void>((resolve) => {
    const messages: unknown[] = []
    api.events.sse(
      { channel: 'news' },
      {
        onOpen: () => console.log('   📡 连接建立'),
        onMessage: (data) => {
          messages.push(data)
          if (data.done) {
            console.log('   ✅ 收到', messages.length, '条消息')
            resolve()
          } else {
            console.log('   📨', data)
          }
        },
        onClose: () => console.log('   📴 连接关闭'),
        onError: (err) => console.error('   ❌', err),
      }
    )
  })
  console.log()
  
  // 测试 POST SSE
  console.log('3️⃣ POST SSE - AI 对话')
  await new Promise<void>((resolve) => {
    let output = ''
    api.chat.stream.sse(
      { messages: [{ role: 'user', content: '你好，世界！' }], model: 'test' },
      {
        onOpen: () => console.log('   📡 连接建立'),
        onMessage: (data) => {
          if (data.content) {
            output += data.content
            process.stdout.write(data.content)
          }
          if (data.done) {
            console.log('\n   ✅ 完成，共', output.length, '字符')
            resolve()
          }
        },
        onClose: () => console.log('   📴 连接关闭'),
        onError: (err) => console.error('   ❌', err),
      },
      { method: 'POST' }
    )
  })
  console.log()
  
  // 测试 DELETE SSE
  console.log('4️⃣ DELETE SSE - 批量删除')
  await new Promise<void>((resolve) => {
    api.batch.delete.sse(
      { ids: ['item-1', 'item-2', 'item-3'] },
      {
        onOpen: () => console.log('   📡 连接建立'),
        onMessage: (data) => {
          if (data.done) {
            console.log('   ✅ 删除完成')
            resolve()
          } else {
            console.log(`   🗑️ 删除 ${data.current} (${data.deleted}/${data.total})`)
          }
        },
        onClose: () => console.log('   📴 连接关闭'),
        onError: (err) => console.error('   ❌', err),
      },
      { method: 'DELETE' }
    )
  })
  console.log()
  
  // 测试 params + query
  console.log('5️⃣ GET SSE - params + query (房间消息)')
  await new Promise<void>((resolve) => {
    api.rooms({ id: 'room-123' }).messages.sse(
      { since: '2024-01-01' },  // query
      {
        onOpen: () => console.log('   📡 连接建立'),
        onMessage: (data) => {
          if (data.done) {
            console.log('   ✅ 完成')
            resolve()
          } else {
            console.log(`   📨 [${data.roomId}] ${data.message} (since: ${data.since})`)
          }
        },
        onClose: () => console.log('   📴 连接关闭'),
        onError: (err) => console.error('   ❌', err),
      }
    )
  })
  console.log()
  
  // 测试 body + query
  console.log('6️⃣ POST SSE - body + query (搜索)')
  await new Promise<void>((resolve) => {
    api.search.sse(
      { keyword: 'TypeScript', filters: { lang: 'zh' } },  // body
      {
        onOpen: () => console.log('   📡 连接建立'),
        onMessage: (data) => {
          if (data.done) {
            console.log(`   ✅ 搜索完成，共 ${data.total} 条`)
            resolve()
          } else {
            console.log(`   🔍 [${data.keyword}] 页${data.page} - ${data.result}`)
          }
        },
        onClose: () => console.log('   📴 连接关闭'),
        onError: (err) => console.error('   ❌', err),
      },
      { method: 'POST', query: { page: 2, limit: 3 } }  // query in options
    )
  })
  console.log()
  
  console.log('✅ 所有测试完成!')
  process.exit(0)
}

main().catch(console.error)
