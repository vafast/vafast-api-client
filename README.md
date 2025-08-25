# Vafast API Client

一个专门为 [Vafast](https://github.com/vafastjs/vafast) 框架打造的现代化、类型安全的 API 客户端插件。

## ✨ 特性

- 🚀 **专为 Vafast 设计**: 完全兼容 Vafast 框架架构
- 🔒 **类型安全**: 完整的 TypeScript 类型支持
- 🎯 **智能路由**: 自动推断路由类型和方法
- 🔄 **自动重试**: 内置指数退避重试机制
- 📡 **WebSocket 支持**: 完整的 WebSocket 客户端
- 🧩 **中间件系统**: 灵活的请求/响应处理
- 🎛️ **拦截器**: 强大的请求/响应拦截能力
- 📁 **文件上传**: 支持文件和 FormData 上传
- 💾 **缓存系统**: 智能的响应缓存机制
- 📊 **监控统计**: 详细的请求统计和性能监控

## 📦 安装

```bash
bun add @vafast/api-client
```

## 🚀 快速开始

### 基础用法

```typescript
import { VafastApiClient } from '@vafast/api-client'

// 创建客户端
const client = new VafastApiClient({
  baseURL: 'https://api.example.com',
  timeout: 10000,
  retries: 3
})

// 发送请求
const response = await client.get('/users', { page: 1, limit: 10 })
if (response.error) {
  console.error('Error:', response.error)
} else {
  console.log('Users:', response.data)
}
```

### 类型安全客户端

```typescript
import { createTypedClient } from '@vafast/api-client'
import type { Server } from 'vafast'

// 从 Vafast 服务器创建类型安全客户端
const typedClient = createTypedClient<Server>(server, {
  baseURL: 'https://api.example.com'
})

// 现在有完整的类型检查
const users = await typedClient.get('/users', { page: 1, limit: 10 })
const user = await typedClient.post('/users', { name: 'John', email: 'john@example.com' })
```

### WebSocket 客户端

```typescript
import { createWebSocketClient } from '@vafast/api-client'

const wsClient = createWebSocketClient('wss://ws.example.com', {
  autoReconnect: true,
  maxReconnectAttempts: 5
})

await wsClient.connect()

wsClient.on('message', (data) => {
  console.log('Received:', data)
})

wsClient.send({ type: 'chat', message: 'Hello!' })
```

## 📚 API 参考

### VafastApiClient

主要的 API 客户端类。

#### 构造函数

```typescript
new VafastApiClient(config?: ApiClientConfig)
```

#### 配置选项

```typescript
interface ApiClientConfig {
  baseURL?: string                    // 基础 URL
  defaultHeaders?: Record<string, string>  // 默认请求头
  timeout?: number                    // 请求超时时间（毫秒）
  retries?: number                    // 重试次数
  retryDelay?: number                 // 重试延迟（毫秒）
  validateStatus?: (status: number) => boolean  // 状态码验证函数
}
```

#### 方法

- `get(path, query?, config?)` - GET 请求
- `post(path, body?, config?)` - POST 请求
- `put(path, body?, config?)` - PUT 请求
- `delete(path, config?)` - DELETE 请求
- `patch(path, body?, config?)` - PATCH 请求
- `head(path, config?)` - HEAD 请求
- `options(path, config?)` - OPTIONS 请求

### 中间件系统

```typescript
client.addMiddleware({
  name: 'logging',
  onRequest: async (request, config) => {
    console.log(`[${new Date().toISOString()}] ${request.method} ${request.url}`)
    return request
  },
  onResponse: async (response, config) => {
    console.log(`Response: ${response.status}`)
    return response
  },
  onError: async (error, config) => {
    console.error('Error:', error.message)
  }
})
```

### 拦截器系统

```typescript
client.addInterceptor({
  request: async (config) => {
    // 添加认证头
    config.headers = { ...config.headers, 'Authorization': 'Bearer token' }
    return config
  },
  response: async (response) => {
    // 处理响应
    return response
  },
  error: async (error) => {
    // 处理错误
    return error
  }
})
```

### WebSocket 客户端

```typescript
const wsClient = createWebSocketClient(url, options)

// 连接
await wsClient.connect()

// 监听事件
wsClient.on('message', (data) => console.log(data))
wsClient.on('open', () => console.log('Connected'))
wsClient.on('close', () => console.log('Disconnected'))

// 发送数据
wsClient.send({ type: 'chat', message: 'Hello' })

// 断开连接
wsClient.disconnect()
```

## 🔧 高级用法

### 文件上传

```typescript
// 单个文件
const response = await client.post('/upload', {
  file: fileInput.files[0],
  description: 'User avatar'
})

// 多个文件
const response = await client.post('/upload', {
  files: [file1, file2, file3],
  category: 'images'
})

// 混合数据
const response = await client.post('/upload', {
  file: fileInput.files[0],
  metadata: {
    name: 'avatar.jpg',
    size: fileInput.files[0].size,
    type: fileInput.files[0].type
  }
})
```

### 路径参数

```typescript
// 使用工具函数替换路径参数
import { replacePathParams } from '@vafast/api-client'

const path = '/users/:id/posts/:postId'
const params = { id: '123', postId: '456' }
const resolvedPath = replacePathParams(path, params)
// 结果: '/users/123/posts/456'

const response = await client.get(resolvedPath)
```

### 查询参数构建

```typescript
import { buildQueryString } from '@vafast/api-client'

const query = { page: 1, limit: 10, search: 'john' }
const queryString = buildQueryString(query)
// 结果: '?page=1&limit=10&search=john'

const response = await client.get(`/users${queryString}`)
```

### 缓存配置

```typescript
client.setCacheConfig({
  enabled: true,
  ttl: 300000, // 5分钟
  maxSize: 100,
  strategy: 'memory'
})
```

### 重试配置

```typescript
client.setRetryConfig({
  enabled: true,
  maxRetries: 5,
  retryDelay: 1000,
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504]
})
```

## 🧪 测试

```bash
bun test
```

## 📖 示例

查看 `example/` 目录中的完整示例：

- `index.ts` - 主要使用示例
- 基础 HTTP 请求
- 类型安全客户端
- WebSocket 客户端
- 中间件和拦截器
- 文件上传

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🔗 相关链接

- [Vafast 官方文档](https://vafast.dev)
- [GitHub 仓库](https://github.com/vafastjs/vafast-api-client)
- [问题反馈](https://github.com/vafastjs/vafast-api-client/issues)
