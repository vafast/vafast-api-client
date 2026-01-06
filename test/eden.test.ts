import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import { eden } from '../src'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('Eden Client', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: '1', name: 'John' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    )
  })

  // ============= 类型定义 =============
  
  interface TestContract {
    users: {
      get: { query: { page?: number }; return: { id: string }[] }
      post: { body: { name: string }; return: { id: string } }
      ':id': {
        get: { return: { id: string; name: string } }
        put: { body: { name: string }; return: { id: string; name: string } }
        delete: { return: { success: boolean } }
      }
    }
    chat: {
      stream: {
        get: { query: { prompt: string }; return: unknown; sse: true }
      }
    }
  }

  // ============= 基础请求测试 =============

  describe('基础请求', () => {
    it('应该发送 GET 请求', async () => {
      const api = eden<TestContract>('http://localhost:3000')
      
      const result = await api.users.get({ page: 1 })
      
      expect(mockFetch).toHaveBeenCalled()
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.url).toContain('/users')
      expect(req.url).toContain('page=1')
      expect(req.method).toBe('GET')
      expect(result.status).toBe(200)
    })

    it('应该发送 POST 请求', async () => {
      const api = eden<TestContract>('http://localhost:3000')
      
      await api.users.post({ name: 'John' })
      
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.method).toBe('POST')
      expect(req.url).toContain('/users')
    })

    it('应该正确设置请求头', async () => {
      const api = eden<TestContract>('http://localhost:3000', {
        headers: { 'Authorization': 'Bearer token123' }
      })
      
      await api.users.get()
      
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.headers.get('Authorization')).toBe('Bearer token123')
      expect(req.headers.get('Content-Type')).toBe('application/json')
    })
  })

  // ============= 参数化路由测试 =============

  describe('参数化路由', () => {
    it('应该通过函数调用处理路径参数', async () => {
      const api = eden<TestContract>('http://localhost:3000')
      
      await api.users({ id: '123' }).get()
      
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.url).toBe('http://localhost:3000/users/123')
      expect(req.method).toBe('GET')
    })

    it('应该处理 PUT 请求和路径参数', async () => {
      const api = eden<TestContract>('http://localhost:3000')
      
      await api.users({ id: '123' }).put({ name: 'Jane' })
      
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.url).toBe('http://localhost:3000/users/123')
      expect(req.method).toBe('PUT')
    })

    it('应该处理 DELETE 请求和路径参数', async () => {
      const api = eden<TestContract>('http://localhost:3000')
      
      await api.users({ id: '456' }).delete()
      
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.url).toBe('http://localhost:3000/users/456')
      expect(req.method).toBe('DELETE')
    })

    it('应该对路径参数进行 URL 编码', async () => {
      const api = eden<TestContract>('http://localhost:3000')
      
      await api.users({ id: 'user/123' }).get()
      
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.url).toBe('http://localhost:3000/users/user%2F123')
    })
  })

  // ============= 嵌套路由测试 =============

  describe('嵌套路由', () => {
    interface NestedContract {
      users: {
        ':id': {
          posts: {
            get: { return: { id: string }[] }
            ':id': {
              get: { return: { id: string; title: string } }
            }
          }
        }
      }
    }

    it('应该处理嵌套路径', async () => {
      const api = eden<NestedContract>('http://localhost:3000')
      
      await api.users({ id: '123' }).posts.get()
      
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.url).toBe('http://localhost:3000/users/123/posts')
    })

    it('应该处理多层嵌套路径参数', async () => {
      const api = eden<NestedContract>('http://localhost:3000')
      
      // 动态参数统一使用 :id
      await api.users({ id: '123' }).posts({ id: '456' }).get()
      
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.url).toBe('http://localhost:3000/users/123/posts/456')
    })
  })

  // ============= 请求取消测试 =============

  describe('请求取消', () => {
    it('应该支持通过 AbortController 取消请求', async () => {
      const controller = new AbortController()
      
      mockFetch.mockImplementation(() => {
        return new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            const error = new Error('This operation was aborted')
            error.name = 'AbortError'
            reject(error)
          })
        })
      })

      const api = eden<TestContract>('http://localhost:3000')
      
      const promise = api.users.get(undefined, { signal: controller.signal })
      controller.abort()
      
      const result = await promise
      expect(result.error).toBeTruthy()
      expect(result.status).toBe(0)
    })

    it('应该在超时后自动取消请求', async () => {
      mockFetch.mockImplementation((input: Request | string) => {
        return new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            resolve(new Response(JSON.stringify({}), { status: 200 }))
          }, 5000)
          
          // 从 Request 对象获取 signal
          const signal = input instanceof Request ? input.signal : undefined
          signal?.addEventListener('abort', () => {
            clearTimeout(timeoutId)
            const error = new Error('This operation was aborted')
            error.name = 'AbortError'
            reject(error)
          })
        })
      })

      const api = eden<TestContract>('http://localhost:3000', { timeout: 100 })
      
      const result = await api.users.get()
      
      expect(result.error).toBeTruthy()
      expect(result.status).toBe(0)
    })
  })

  // ============= 拦截器测试 =============

  describe('拦截器', () => {
    it('应该执行 onRequest 拦截器', async () => {
      const onRequest = vi.fn((req: Request) => {
        return new Request(req.url, {
          ...req,
          headers: { ...Object.fromEntries(req.headers), 'X-Custom': 'value' }
        })
      })

      const api = eden<TestContract>('http://localhost:3000', { onRequest })
      
      await api.users.get()
      
      expect(onRequest).toHaveBeenCalled()
    })

    it('应该执行 onResponse 拦截器', async () => {
      const onResponse = vi.fn((response) => response)

      const api = eden<TestContract>('http://localhost:3000', { onResponse })
      
      await api.users.get()
      
      expect(onResponse).toHaveBeenCalled()
    })

    it('应该在错误时执行 onError 回调', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        })
      )

      const onError = vi.fn()
      const api = eden<TestContract>('http://localhost:3000', { onError })
      
      await api.users.get()
      
      expect(onError).toHaveBeenCalled()
    })
  })

  // ============= 响应处理测试 =============

  describe('响应处理', () => {
    it('应该正确解析 JSON 响应', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ users: [{ id: '1' }], total: 10 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )

      const api = eden<TestContract>('http://localhost:3000')
      const result = await api.users.get()
      
      expect(result.data).toEqual({ users: [{ id: '1' }], total: 10 })
      expect(result.status).toBe(200)
      expect(result.error).toBeNull()
    })

    it('应该正确解析文本响应', async () => {
      mockFetch.mockResolvedValue(
        new Response('Hello World', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        })
      )

      const api = eden<TestContract>('http://localhost:3000')
      const result = await api.users.get()
      
      expect(result.data).toBe('Hello World')
    })

    it('应该处理 HTTP 错误状态', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
      )

      const api = eden<TestContract>('http://localhost:3000')
      const result = await api.users.get()
      
      expect(result.status).toBe(401)
      expect(result.error).toBeTruthy()
      expect(result.error?.message).toContain('401')
    })

    it('应该处理网络错误', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const api = eden<TestContract>('http://localhost:3000')
      const result = await api.users.get()
      
      expect(result.error?.message).toBe('Network error')
      expect(result.status).toBe(0)
      expect(result.data).toBeNull()
    })
  })

  // ============= Query 参数测试 =============

  describe('Query 参数', () => {
    it('应该正确构建查询字符串', async () => {
      const api = eden<TestContract>('http://localhost:3000')
      
      await api.users.get({ page: 2 })
      
      const req = mockFetch.mock.calls[0][0] as Request
      const url = new URL(req.url)
      expect(url.searchParams.get('page')).toBe('2')
    })

    it('应该忽略 undefined 和 null 值', async () => {
      // 直接使用 TestContract，测试 users.get
      const api = eden<TestContract>('http://localhost:3000')
      
      await api.users.get({ page: undefined })
      
      const req = mockFetch.mock.calls[0][0] as Request
      const url = new URL(req.url)
      // undefined 值不应该出现在查询字符串中
      expect(url.searchParams.has('page')).toBe(false)
    })
  })
})

// ============= SSE 测试 =============

describe('SSE 订阅', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('应该调用 subscribe 方法', async () => {
    // 创建模拟 SSE 流
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"message":"hello"}\n\n'))
        controller.close()
      }
    })

    mockFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      })
    )

    interface SSEContract {
      events: {
        get: { query: { channel: string }; return: unknown; sse: { readonly __brand: 'SSE' } }
      }
    }

    const api = eden<SSEContract>('http://localhost:3000')
    const onMessage = vi.fn()
    const onClose = vi.fn()

    await new Promise<void>((resolve) => {
      api.events.subscribe(
        { channel: 'test' },
        {
          onMessage,
          onClose: () => {
            onClose()
            resolve()
          }
        }
      )
    })

    expect(mockFetch).toHaveBeenCalled()
    expect(onMessage).toHaveBeenCalledWith({ message: 'hello' })
    expect(onClose).toHaveBeenCalled()
  })

  it('应该支持取消订阅', async () => {
    const stream = new ReadableStream({
      start(controller) {
        // 永不关闭的流
      }
    })

    mockFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      })
    )

    interface SSEContract {
      events: {
        get: { return: unknown; sse: { readonly __brand: 'SSE' } }
      }
    }

    const api = eden<SSEContract>('http://localhost:3000')
    
    const sub = api.events.subscribe({
      onMessage: () => {}
    })

    expect(sub.connected).toBe(false) // 还在连接中
    
    sub.unsubscribe()
    expect(sub.connected).toBe(false)
  })
})
