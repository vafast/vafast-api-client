import { 
  VafastApiClient, 
  createTypedClient, 
  createWebSocketClient,
  createTypedWebSocketClient 
} from '../src'

// 创建基础 API 客户端
const apiClient = new VafastApiClient({
  baseURL: 'https://api.example.com',
  timeout: 10000,
  retries: 3,
  defaultHeaders: {
    'Authorization': 'Bearer your-token-here'
  }
})

// 添加请求拦截器
apiClient.addInterceptor({
  request: async (config) => {
    console.log('Request interceptor:', config)
    // 可以在这里添加认证头、日志等
    return config
  },
  response: async (response) => {
    console.log('Response interceptor:', response.status)
    return response
  },
  error: async (error) => {
    console.error('Error interceptor:', error)
    return error
  }
})

// 添加中间件
apiClient.addMiddleware({
  name: 'logging',
  onRequest: async (request, config) => {
    console.log(`[${new Date().toISOString()}] ${request.method} ${request.url}`)
    return request
  },
  onResponse: async (response, config) => {
    console.log(`[${new Date().toISOString()}] Response: ${response.status}`)
    return response
  },
  onError: async (error, config) => {
    console.error(`[${new Date().toISOString()}] Error:`, error.message)
  }
})

// 使用示例
async function example() {
  try {
    // GET 请求
    const usersResponse = await apiClient.get('/users', { page: 1, limit: 10 })
    if (usersResponse.error) {
      console.error('Failed to fetch users:', usersResponse.error)
    } else {
      console.log('Users:', usersResponse.data)
    }

    // POST 请求
    const createUserResponse = await apiClient.post('/users', {
      name: 'John Doe',
      email: 'john@example.com'
    })
    if (createUserResponse.error) {
      console.error('Failed to create user:', createUserResponse.error)
    } else {
      console.log('Created user:', createUserResponse.data)
    }

    // PUT 请求
    const updateUserResponse = await apiClient.put('/users/123', {
      name: 'John Updated',
      email: 'john.updated@example.com'
    })
    if (updateUserResponse.error) {
      console.error('Failed to update user:', updateUserResponse.error)
    } else {
      console.log('Updated user:', updateUserResponse.data)
    }

    // DELETE 请求
    const deleteUserResponse = await apiClient.delete('/users/123')
    if (deleteUserResponse.error) {
      console.error('Failed to delete user:', deleteUserResponse.error)
    } else {
      console.log('Deleted user successfully')
    }

    // 文件上传
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    const file = fileInput.files?.[0]
    
    if (file) {
      const uploadResponse = await apiClient.post('/upload', {
        file: file,
        description: 'User avatar'
      })
      if (uploadResponse.error) {
        console.error('Failed to upload file:', uploadResponse.error)
      } else {
        console.log('File uploaded:', uploadResponse.data)
      }
    }

  } catch (error) {
    console.error('Example error:', error)
  }
}

// 类型安全客户端示例
interface User {
  id: number
  name: string
  email: string
}

interface CreateUserRequest {
  name: string
  email: string
}

interface ApiResponse<T> {
  data: T
  message: string
}

// 模拟服务器类型
type MockServer = {
  routes: {
    '/users': {
      GET: { query: { page?: number; limit?: number } }
      POST: { body: CreateUserRequest }
    }
    '/users/:id': {
      GET: { params: { id: string } }
      PUT: { params: { id: string }; body: Partial<CreateUserRequest> }
      DELETE: { params: { id: string } }
    }
  }
}

// 创建类型安全客户端
const typedClient = createTypedClient<MockServer>({} as MockServer, {
  baseURL: 'https://api.example.com'
})

// 使用类型安全客户端
async function typedExample() {
  try {
    // 这些调用现在有类型检查
    const users = await typedClient.get('/users', { page: 1, limit: 10 })
    const user = await typedClient.post('/users', { name: 'Jane', email: 'jane@example.com' })
    
    console.log('Typed client response:', users, user)
  } catch (error) {
    console.error('Typed example error:', error)
  }
}

// WebSocket 示例
async function websocketExample() {
  const wsClient = createWebSocketClient('wss://ws.example.com', {
    autoReconnect: true,
    maxReconnectAttempts: 5,
    reconnectDelay: 1000
  })

  // 监听连接事件
  wsClient.on('open', () => {
    console.log('WebSocket connected')
  })

  wsClient.on('message', (data) => {
    console.log('WebSocket message:', data)
  })

  wsClient.on('close', () => {
    console.log('WebSocket disconnected')
  })

  try {
    await wsClient.connect()
    
    // 发送消息
    wsClient.send({ type: 'chat', message: 'Hello, WebSocket!' })
    
    // 延迟后断开连接
    setTimeout(() => {
      wsClient.disconnect()
    }, 5000)
  } catch (error) {
    console.error('WebSocket error:', error)
  }
}

// 类型安全的 WebSocket 客户端
interface ChatEvents {
  message: { text: string; userId: string }
  join: { room: string; userId: string }
  leave: { room: string; userId: string }
}

const typedWsClient = createTypedWebSocketClient<ChatEvents>('wss://chat.example.com')

async function typedWebSocketExample() {
  try {
    await typedWsClient.connect()
    
    // 类型安全的事件监听
    typedWsClient.on('message', (data) => {
      console.log('Chat message:', data.text, 'from user:', data.userId)
    })
    
    typedWsClient.on('join', (data) => {
      console.log('User joined:', data.userId, 'room:', data.room)
    })
    
    // 类型安全的发送
    typedWsClient.send('message', { text: 'Hello!', userId: 'user123' })
    typedWsClient.send('join', { room: 'general', userId: 'user123' })
    
  } catch (error) {
    console.error('Typed WebSocket error:', error)
  }
}

// 运行示例
console.log('🚀 Vafast API Client Examples')
console.log('==============================')

// 运行基础示例
example().then(() => {
  console.log('✅ Basic examples completed')
})

// 运行类型安全示例
typedExample().then(() => {
  console.log('✅ Typed examples completed')
})

// 运行 WebSocket 示例
websocketExample().then(() => {
  console.log('✅ WebSocket examples completed')
})

// 运行类型安全 WebSocket 示例
typedWebSocketExample().then(() => {
  console.log('✅ Typed WebSocket examples completed')
})

export { apiClient, typedClient, wsClient: createWebSocketClient }
