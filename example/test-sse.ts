/**
 * SSE 端到端测试
 * 启动服务器并测试 SSE 流式响应
 */

import { 
  defineRoutes, 
  route, 
  createHandler, 
  createSSEHandler,
  Type,
  serve
} from 'vafast'
import { eden, InferEden } from '../src'

// 定义路由
const routes = defineRoutes([
  // 普通 GET 请求
  route('GET', '/hello', createHandler(
    { query: Type.Object({ name: Type.Optional(Type.String()) }) },
    async ({ query }) => ({ message: `Hello, ${query.name || 'World'}!` })
  )),
  
  // SSE 流式响应
  route('GET', '/stream', createSSEHandler(
    { query: Type.Object({ count: Type.Optional(Type.Number({ default: 5 })) }) },
    async function* ({ query }) {
      const count = query.count ?? 5
      
      yield { event: 'start', data: { message: '开始流式传输...' } }
      
      for (let i = 1; i <= count; i++) {
        yield { data: { index: i, text: `消息 ${i}/${count}` } }
        await new Promise(r => setTimeout(r, 200))
      }
      
      yield { event: 'end', data: { message: '传输完成!' } }
    }
  ))
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
      
      if (url.pathname === '/stream') {
        const count = parseInt(url.searchParams.get('count') || '5')
        
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder()
            
            controller.enqueue(encoder.encode(`event: start\ndata: ${JSON.stringify({ message: '开始流式传输...' })}\n\n`))
            
            for (let i = 1; i <= count; i++) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ index: i, text: `消息 ${i}/${count}` })}\n\n`))
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
  
  // 测试普通请求
  console.log('📡 测试普通请求...')
  const result = await api.hello.get({ name: 'TypeScript' })
  console.log('响应:', result.data)
  console.log()
  
  // 测试 SSE
  console.log('🌊 测试 SSE 流式响应...')
  
  await new Promise<void>((resolve) => {
    const sub = api.stream.subscribe(
      { count: 3 },
      {
        onOpen: () => console.log('📡 SSE 连接已建立'),
        onMessage: (data: unknown) => {
          console.log('📨 收到:', data)
        },
        onError: (err) => console.error('❌ 错误:', err.message),
        onClose: () => {
          console.log('📴 SSE 连接已关闭')
          resolve()
        }
      }
    )
    
    // 3 秒超时
    setTimeout(() => {
      sub.unsubscribe()
      resolve()
    }, 3000)
  })
  
  console.log('\n✅ 测试完成!')
  
  // 关闭服务器
  server.stop()
}

main().catch(console.error)

