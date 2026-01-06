/**
 * ✨ 自动从 vafast 路由推断契约
 * 
 * 特性：
 * 1. 使用 route() 函数，无需 as const
 * 2. 支持 SSE 流式响应
 * 3. 完整的类型推断
 */

import { 
  defineRoutes, 
  route, 
  get, 
  post, 
  put, 
  del,
  createHandler, 
  createSSEHandler,
  Type 
} from 'vafast'
import { eden, InferEden } from '../src'

// ============= 业务类型定义 =============

interface User {
  id: string
  name: string
  email: string
}

interface ChatMessage {
  text: string
  timestamp?: number
}

// ============= 服务端：定义路由 =============

/**
 * ✨ 新方式：使用 route() 函数，无需 as const！
 */
const routes = defineRoutes([
  // GET /users - 获取用户列表
  route('GET', '/users', createHandler(
    { query: Type.Object({ 
      page: Type.Optional(Type.Number({ default: 1 })), 
      limit: Type.Optional(Type.Number({ default: 10 })) 
    })},
    async ({ query }) => ({ 
      users: [] as User[], 
      total: 0,
      page: query.page ?? 1,
      limit: query.limit ?? 10
    })
  )),
  
  // POST /users - 创建用户
  route('POST', '/users', createHandler(
    { body: Type.Object({ name: Type.String(), email: Type.String() }) },
    async ({ body }) => ({ 
      id: crypto.randomUUID(), 
      name: body.name, 
      email: body.email 
    } as User)
  )),
  
  // GET /users/:id - 获取单个用户
  route('GET', '/users/:id', createHandler(
    { params: Type.Object({ id: Type.String() }) },
    async ({ params }) => ({ 
      id: params.id, 
      name: 'User', 
      email: 'user@example.com' 
    } as User | null)
  )),
  
  // PUT /users/:id - 更新用户（使用快捷方法）
  put('/users/:id', createHandler(
    { 
      params: Type.Object({ id: Type.String() }), 
      body: Type.Object({ 
        name: Type.Optional(Type.String()), 
        email: Type.Optional(Type.String()) 
      }) 
    },
    async ({ params, body }) => ({ 
      id: params.id, 
      name: body?.name ?? 'User', 
      email: body?.email ?? 'user@example.com' 
    } as User)
  )),
  
  // DELETE /users/:id - 删除用户（使用快捷方法）
  del('/users/:id', createHandler(
    { params: Type.Object({ id: Type.String() }) },
    async () => ({ success: true, deletedAt: new Date().toISOString() })
  )),

  // 🌊 GET /chat/stream - SSE 流式响应
  route('GET', '/chat/stream', createSSEHandler(
    { query: Type.Object({ prompt: Type.String() }) },
    async function* ({ query }) {
      // 模拟 AI 流式响应
      yield { event: 'start', data: { message: 'Starting...' } }
      
      const words = `Hello! You said: "${query.prompt}"`.split(' ')
      for (const word of words) {
        yield { data: { text: word + ' ' } as ChatMessage }
        await new Promise(r => setTimeout(r, 100))
      }
      
      yield { event: 'end', data: { message: 'Done!' } }
    }
  ))
])

// ============= 🎉 自动推断契约类型！=============

/**
 * 从路由定义自动推断 API 契约
 * 无需手动定义任何接口！无需 as const！
 */
type Api = InferEden<typeof routes>

// ============= 客户端：完全类型安全的调用 =============

const api = eden<Api>('http://localhost:3000', {
  headers: {
    'Authorization': 'Bearer your-token-here'
  },
  timeout: 5000,
  onError: (error) => {
    console.error('API Error:', error.message)
  }
})

async function main() {
  console.log('=== 自动推断契约示例（无需 as const）===\n')

  // ✅ GET /users?page=1&limit=10
  const usersResult = await api.users.get({ page: 1, limit: 10 })
  if (usersResult.data) {
    console.log('📋 用户列表:', usersResult.data.users)
    console.log('   总数:', usersResult.data.total)
  }

  // ✅ POST /users
  const newUserResult = await api.users.post({ 
    name: 'John Doe', 
    email: 'john@example.com' 
  })
  if (newUserResult.data) {
    console.log('\n✨ 新用户:', newUserResult.data.name)
  }

  // ✅ GET /users/:id
  const userResult = await api.users({ id: '123' }).get()
  if (userResult.data) {
    console.log('\n👤 用户详情:', userResult.data.name)
  }

  // ✅ PUT /users/:id
  const updateResult = await api.users({ id: '123' }).put({ name: 'Jane' })
  if (updateResult.data) {
    console.log('\n📝 更新后:', updateResult.data.name)
  }

  // ✅ DELETE /users/:id
  const deleteResult = await api.users({ id: '123' }).delete()
  if (deleteResult.data) {
    console.log('\n🗑️ 删除成功:', deleteResult.data.success)
  }

  // 🌊 SSE 流式响应
  console.log('\n=== SSE 流式响应 ===\n')
  
  // SSE 返回类型目前是 unknown，需要手动断言
  // 未来版本会改进 SSE 返回类型推断
  const subscription = api.chat.stream.subscribe(
    { prompt: 'Hello AI!' },
    {
      onOpen: () => console.log('📡 连接已建立'),
      onMessage: (data: unknown) => {
        console.log('收到消息:', data)
      },
      onError: (err) => console.error('❌ 错误:', err.message),
      onClose: () => console.log('📴 连接已关闭')
    }
  )

  // 5 秒后取消订阅
  setTimeout(() => {
    subscription.unsubscribe()
    console.log('\n\n=== 示例完成 ===')
  }, 5000)
}

main().catch(console.error)

// ============= 导出 =============

export { routes, api }
export type { Api }
