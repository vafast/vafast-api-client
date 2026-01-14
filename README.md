# @vafast/api-client

类型安全的 Eden 风格 API 客户端，支持从 vafast 路由自动推断类型。

## 安装

```bash
npm install @vafast/api-client vafast
```

## 快速开始

### 方式 1：从 vafast 路由自动推断类型（推荐）

```typescript
// ============= 服务端 =============
import { defineRoute, defineRoutes, Type, Server } from 'vafast'

// 定义路由（使用 as const 保留字面量类型）
const routeDefinitions = [
  defineRoute({
    method: 'GET',
    path: '/users',
    schema: { query: Type.Object({ page: Type.Number() }) },
    handler: ({ query }) => ({ users: [], page: query.page })
  }),
  defineRoute({
    method: 'POST',
    path: '/users',
    schema: { body: Type.Object({ name: Type.String() }) },
    handler: ({ body }) => ({ id: '1', name: body.name })
  }),
  defineRoute({
    method: 'GET',
    path: '/users/:id',
    schema: { params: Type.Object({ id: Type.String() }) },
    handler: ({ params }) => ({ id: params.id, name: 'John' })
  })
] as const

// 创建服务器
const routes = defineRoutes(routeDefinitions)
const server = new Server(routes)

// ============= 客户端 =============
import { eden, InferEden } from '@vafast/api-client'

// 自动推断类型
type Api = InferEden<typeof routeDefinitions>
const api = eden<Api>('http://localhost:3000')

// ✅ 完全类型安全
const { data } = await api.users.get({ page: 1 })  // query 有类型提示
const { data: user } = await api.users({ id: '123' }).get()  // 动态参数
```

### 方式 2：手动定义契约（非 vafast API）

```typescript
import { eden } from '@vafast/api-client'

// 手动定义契约类型
type MyApi = {
  users: {
    get: { query: { page: number }; return: { users: User[]; total: number } }
    post: { body: { name: string }; return: User }
    ':id': {
      get: { return: User | null }
      put: { body: Partial<User>; return: User }
      delete: { return: { success: boolean } }
    }
  }
}

const api = eden<MyApi>('https://api.example.com')

// 调用方式完全相同
const { data } = await api.users.get({ page: 1 })
const { data: user } = await api.users({ id: '123' }).get()
```

## 调用方式

```typescript
// GET 请求 + query 参数
const { data, error } = await api.users.get({ page: 1, limit: 10 })

// POST 请求 + body
const { data, error } = await api.users.post({ name: 'John', email: 'john@example.com' })

// 动态路径参数
const { data, error } = await api.users({ id: '123' }).get()
const { data, error } = await api.users({ id: '123' }).put({ name: 'Jane' })
const { data, error } = await api.users({ id: '123' }).delete()

// 嵌套路径
const { data, error } = await api.users({ id: '123' }).posts.get()
const { data, error } = await api.users({ id: '123' }).posts({ id: '456' }).get()
```

## Go 风格错误处理

```typescript
const { data, error } = await api.users.get()

if (error) {
  // error: { code: number; message: string }
  console.error(`错误 ${error.code}: ${error.message}`)
  return
}

// data 在这里保证非 null
console.log(data.users)
```

## 配置选项

```typescript
const api = eden<Api>('http://localhost:3000', {
  // 默认请求头
  headers: {
    'Authorization': 'Bearer token123'
  },
  
  // 请求超时（毫秒）
  timeout: 30000,
  
  // 请求拦截器
  onRequest: async (request) => {
    // 可以修改请求
    return request
  },
  
  // 响应拦截器
  onResponse: async (response) => {
    // 可以修改响应
    return response
  },
  
  // 错误回调
  onError: (error) => {
    console.error('API Error:', error.code, error.message)
  }
})
```

## SSE 流式响应

```typescript
import { defineRoute, Type } from 'vafast'

// 服务端定义 SSE 路由
const routeDefinitions = [
  defineRoute({
    method: 'GET',
    path: '/chat/stream',
    schema: { query: Type.Object({ prompt: Type.String() }) },
    handler: async function* ({ query }) {
      yield { data: { text: 'Hello' } }
      yield { data: { text: 'World' } }
    }
  })
] as const

// 客户端（手动标记 SSE）
type Api = {
  chat: {
    stream: {
      get: {
        query: { prompt: string }
        return: { text: string }
        sse: { readonly __brand: 'SSE' }
      }
    }
  }
}

const api = eden<Api>('http://localhost:3000')

// 订阅 SSE 流
const subscription = api.chat.stream.subscribe(
  { prompt: 'Hello' },
  {
    onMessage: (data) => {
      console.log('收到消息:', data.text)
    },
    onError: (error) => {
      console.error('错误:', error.message)
    },
    onOpen: () => console.log('连接建立'),
    onClose: () => console.log('连接关闭'),
    onReconnect: (attempt, max) => console.log(`重连中 ${attempt}/${max}`),
    onMaxReconnects: () => console.log('达到最大重连次数')
  },
  {
    reconnectInterval: 3000,  // 重连间隔
    maxReconnects: 5          // 最大重连次数
  }
)

// 取消订阅
subscription.unsubscribe()
```

## 请求取消

```typescript
const controller = new AbortController()

const promise = api.users.get({ page: 1 }, { signal: controller.signal })

// 取消请求
controller.abort()
```

## API

### `eden<T>(baseURL, config?)`

创建 API 客户端实例。

- `baseURL` - API 基础 URL
- `config` - 可选配置
  - `headers` - 默认请求头
  - `timeout` - 请求超时（毫秒）
  - `onRequest` - 请求拦截器
  - `onResponse` - 响应拦截器
  - `onError` - 错误回调

### `InferEden<T>`

从 `defineRoute` 数组推断 Eden 契约类型。

```typescript
import { defineRoute, Type } from 'vafast'
import { InferEden } from '@vafast/api-client'

const routeDefinitions = [
  defineRoute({
    method: 'GET',
    path: '/users',
    schema: { query: Type.Object({ page: Type.Number() }) },
    handler: ({ query }) => ({ users: [], page: query.page })
  })
] as const

type Api = InferEden<typeof routeDefinitions>
```

## License

MIT
