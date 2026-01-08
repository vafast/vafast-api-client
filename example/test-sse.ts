/**
 * SSE 端到端测试
 * 测试功能：
 * 1. 请求取消 (AbortController)
 * 2. SSE 自动重连
 */

import { 
  defineRoutes, 
  createHandler, 
  createSSEHandler,
  Type,
  serve
} from 'vafast'
import { eden, InferEden } from '../src'

// 定义路由
const routes = defineRoutes([
  // 普通 GET 请求
  {
    method: 'GET',
    path: '/hello',
    handler: createHandler(
      { query: Type.Object({ name: Type.Optional(Type.String()) }) },
      async ({ query }) => ({ message: `Hello, ${query.name || 'World'}!` })
    )
  },
  
  // 慢请求（用于测试取消）
  {
    method: 'GET',
    path: '/slow',
    handler: createHandler(
      {},
      async () => {
        await new Promise(r => setTimeout(r, 5000))
        return { message: 'Slow response' }
      }
    )
  },
  
  // SSE 流式响应
  {
    method: 'GET',
    path: '/stream',
    handler: createSSEHandler(
      { query: Type.Object({ count: Type.Optional(Type.Number({ default: 5 })) }) },
      async function* ({ query }) {
        const count = query.count ?? 5
        
        yield { event: 'start', data: { message: '开始流式传输...' } }
        
        for (let i = 1; i <= count; i++) {
          yield { id: String(i), data: { index: i, text: `消息 ${i}/${count}` } }
          await new Promise(r => setTimeout(r, 200))
        }
        
        yield { event: 'end', data: { message: '传输完成!' } }
      }
    )
  }
])

type Api = InferEden<typeof routes>

async function main() {
  // 启动服务器
  console.log('🚀 启动服务器...')
  const server = serve({
    fetch: (req) => {
      const url = new URL(req.url)
      
      // 简单路由
      if (url.pathname === '/hello') {
        const name = url.searchParams.get('name') || 'World'
        return new Response(JSON.stringify({ message: `Hello, ${name}!` }), {
          headers: { 'Content-Type': 'application/json' }
        })
      }
      
      // 慢请求
      if (url.pathname === '/slow') {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve(new Response(JSON.stringify({ message: 'Slow response' }), {
              headers: { 'Content-Type': 'application/json' }
            }))
          }, 5000)
        })
      }
      
      if (url.pathname === '/stream') {
        const count = parseInt(url.searchParams.get('count') || '5')
        
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder()
            
            controller.enqueue(encoder.encode(`event: start\ndata: ${JSON.stringify({ message: '开始流式传输...' })}\n\n`))
            
            for (let i = 1; i <= count; i++) {
              controller.enqueue(encoder.encode(`id: ${i}\ndata: ${JSON.stringify({ index: i, text: `消息 ${i}/${count}` })}\n\n`))
              await new Promise(r => setTimeout(r, 200))
            }
            
            controller.enqueue(encoder.encode(`event: end\ndata: ${JSON.stringify({ message: '传输完成!' })}\n\n`))
            controller.close()
          }
        })
        
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          }
        })
      }
      
      return new Response('Not Found', { status: 404 })
    },
    port: 3456
  })
  
  console.log('✅ 服务器启动在 http://localhost:3456\n')
  
  // 等待服务器启动
  await new Promise(r => setTimeout(r, 500))
  
  // 创建客户端
  const api = eden<Api>('http://localhost:3456')
  
  // ============= 测试 1: 请求取消 =============
  console.log('🧪 测试 1: 请求取消')
  
  const controller = new AbortController()
  
  // 发起慢请求
  const slowPromise = api.slow.get({ signal: controller.signal })
  
  // 100ms 后取消
  setTimeout(() => {
    controller.abort()
    console.log('   ⏹️ 请求已取消')
  }, 100)
  
  const result = await slowPromise
  // 取消后 status 为 0，error 可能是 AbortError 或 "This operation was aborted"
  if (result.status === 0 && result.error) {
    console.log('   ✅ 请求取消成功 (error:', result.error.message || result.error.name, ')\n')
  } else {
    console.log('   ❌ 请求取消失败: status=', result.status, '\n')
  }
  
  // ============= 测试 2: 普通请求 =============
  console.log('🧪 测试 2: 普通请求')
  const helloResult = await api.hello.get({ name: 'TypeScript' })
  console.log('   响应:', helloResult.data)
  console.log()
  
  // ============= 测试 3: SSE 流式响应 =============
  console.log('🧪 测试 3: SSE 流式响应')
  
  await new Promise<void>((resolve) => {
    const sub = api.stream.subscribe(
      { count: 3 },
      {
        onOpen: () => console.log('   📡 连接已建立'),
        onMessage: (data: unknown) => {
          console.log('   📨', data)
        },
        onError: (err) => console.log('   ❌ 错误:', err.message),
        onClose: () => {
          console.log('   📴 连接已关闭')
          resolve()
        },
        onReconnect: (attempt, max) => {
          console.log(`   🔄 重连中 (${attempt}/${max})...`)
        },
        onMaxReconnects: () => {
          console.log('   ⚠️ 达到最大重连次数')
        }
      },
      {
        reconnectInterval: 1000,
        maxReconnects: 3
      }
    )
    
    // 5 秒超时
    setTimeout(() => {
      sub.unsubscribe()
      resolve()
    }, 5000)
  })
  
  console.log('\n✅ 所有测试完成!')
  
  // 关闭服务器
  server.stop()
}

main().catch(console.error)
