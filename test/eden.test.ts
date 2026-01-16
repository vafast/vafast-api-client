import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import { eden, createClient } from '../src'

// Mock fetch
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

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
      const api = eden<TestContract>(createClient('http://localhost:3000'))
      
      const result = await api.users.get({ page: 1 })
      
      expect(mockFetch).toHaveBeenCalled()
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.url).toContain('/users')
      expect(req.url).toContain('page=1')
      expect(req.method).toBe('GET')
      expect(result.error).toBeNull()
    })

    it('应该发送 POST 请求', async () => {
      const api = eden<TestContract>(createClient('http://localhost:3000'))
      
      await api.users.post({ name: 'John' })
      
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.method).toBe('POST')
      expect(req.url).toContain('/users')
    })

    it('应该正确设置请求头', async () => {
      const client = createClient('http://localhost:3000')
        .headers({ 'Authorization': 'Bearer token123' })
      const api = eden<TestContract>(client)
      
      await api.users.get()
      
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.headers.get('Authorization')).toBe('Bearer token123')
      expect(req.headers.get('Content-Type')).toBe('application/json')
    })
  })

  // ============= 参数化路由测试 =============

  describe('参数化路由', () => {
    it('应该通过函数调用处理路径参数', async () => {
      const api = eden<TestContract>(createClient('http://localhost:3000'))
      
      await api.users({ id: '123' }).get()
      
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.url).toBe('http://localhost:3000/users/123')
      expect(req.method).toBe('GET')
    })

    it('应该处理 PUT 请求和路径参数', async () => {
      const api = eden<TestContract>(createClient('http://localhost:3000'))
      
      await api.users({ id: '123' }).put({ name: 'Jane' })
      
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.url).toBe('http://localhost:3000/users/123')
      expect(req.method).toBe('PUT')
    })

    it('应该处理 DELETE 请求和路径参数', async () => {
      const api = eden<TestContract>(createClient('http://localhost:3000'))
      
      await api.users({ id: '456' }).delete()
      
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.url).toBe('http://localhost:3000/users/456')
      expect(req.method).toBe('DELETE')
    })

    it('应该对路径参数进行 URL 编码', async () => {
      const api = eden<TestContract>(createClient('http://localhost:3000'))
      
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
      const api = eden<NestedContract>(createClient('http://localhost:3000'))
      
      await api.users({ id: '123' }).posts.get()
      
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.url).toBe('http://localhost:3000/users/123/posts')
    })

    it('应该处理多层嵌套路径参数', async () => {
      const api = eden<NestedContract>(createClient('http://localhost:3000'))
      
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

      const api = eden<TestContract>(createClient('http://localhost:3000'))
      
      const promise = api.users.get(undefined, { signal: controller.signal })
      controller.abort()
      
      const result = await promise
      expect(result.error).toBeTruthy()
      // 408 是 HTTP 标准超时状态码
      expect(result.error?.code).toBe(408)
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

      const client = createClient('http://localhost:3000').timeout(100)
      const api = eden<TestContract>(client)
      
      const result = await api.users.get()
      
      expect(result.error).toBeTruthy()
      // 408 是 HTTP 标准超时状态码
      expect(result.error?.code).toBe(408)
    })
  })

  // ============= 中间件测试 =============

  describe('中间件', () => {
    it('应该执行请求中间件', async () => {
      const onRequest = vi.fn()

      const client = createClient('http://localhost:3000')
        .use(async (ctx, next) => {
          onRequest(ctx)
          return next()
        })
      const api = eden<TestContract>(client)
      
      await api.users.get()
      
      expect(onRequest).toHaveBeenCalled()
    })

    it('应该执行响应中间件', async () => {
      const onResponse = vi.fn()

      const client = createClient('http://localhost:3000')
        .use(async (ctx, next) => {
          const response = await next()
          onResponse(response)
          return response
        })
      const api = eden<TestContract>(client)
      
      await api.users.get()
      
      expect(onResponse).toHaveBeenCalled()
    })

    it('应该在错误时执行错误处理', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        })
      )

      const onError = vi.fn()
      const client = createClient('http://localhost:3000')
        .use(async (ctx, next) => {
          const response = await next()
          if (response.error) {
            onError(response.error)
          }
          return response
        })
      const api = eden<TestContract>(client)
      
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

      const api = eden<TestContract>(createClient('http://localhost:3000'))
      const result = await api.users.get()
      
      expect(result.data).toEqual({ users: [{ id: '1' }], total: 10 })
      expect(result.error).toBeNull()
    })

    it('应该正确解析文本响应', async () => {
      mockFetch.mockResolvedValue(
        new Response('Hello World', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        })
      )

      const api = eden<TestContract>(createClient('http://localhost:3000'))
      const result = await api.users.get()
      
      expect(result.data).toBe('Hello World')
    })

    it('应该处理 HTTP 错误状态', async () => {
      // 后端返回 HTTP 401 + { code: 10001, message: '未授权' }
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 10001, message: '未授权' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
      )

      const api = eden<TestContract>(createClient('http://localhost:3000'))
      const result = await api.users.get()
      
      // 应该从响应体提取业务错误码
      expect(result.error?.code).toBe(10001)
      expect(result.error?.message).toBe('未授权')
    })

    it('应该在响应体无错误信息时使用 HTTP 状态码', async () => {
      // 后端返回 HTTP 404 但响应体为空或无 code/message
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        })
      )

      const api = eden<TestContract>(createClient('http://localhost:3000'))
      const result = await api.users.get()
      
      // 回退到 HTTP 状态码
      expect(result.error?.code).toBe(404)
      expect(result.error?.message).toBe('HTTP 404')
    })

    it('应该处理网络错误', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const api = eden<TestContract>(createClient('http://localhost:3000'))
      const result = await api.users.get()
      
      expect(result.error?.message).toBe('Network error')
      expect(result.error?.code).toBe(0)
      expect(result.data).toBeNull()
    })

    it('应该处理只有 code 没有 message 的错误响应', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 10002 }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      )

      const api = eden<TestContract>(createClient('http://localhost:3000'))
      const result = await api.users.get()
      
      expect(result.error?.code).toBe(10002)
      expect(result.error?.message).toBe('HTTP 400')  // 回退到 HTTP 状态
    })

    it('应该处理只有 message 没有 code 的错误响应', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ message: '参数错误' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      )

      const api = eden<TestContract>(createClient('http://localhost:3000'))
      const result = await api.users.get()
      
      expect(result.error?.code).toBe(400)  // 回退到 HTTP 状态码
      expect(result.error?.message).toBe('参数错误')
    })
  })

  // ============= Go 风格错误处理测试 =============

  describe('Go 风格错误处理', () => {
    it('错误中间件应该接收 ApiError 格式', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 10001, message: '用户不存在' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        })
      )

      const onError = vi.fn()
      const client = createClient('http://localhost:3000')
        .use(async (ctx, next) => {
          const response = await next()
          if (response.error) {
            onError(response.error)
          }
          return response
        })
      const api = eden<TestContract>(client)
      
      await api.users.get()
      
      expect(onError).toHaveBeenCalledWith({
        code: 10001,
        message: '用户不存在'
      })
    })

    it('成功响应应该 data 有值 error 为 null', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ id: '1', name: 'John' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )

      const api = eden<TestContract>(createClient('http://localhost:3000'))
      const result = await api.users({ id: '1' }).get()
      
      expect(result.data).toEqual({ id: '1', name: 'John' })
      expect(result.error).toBeNull()
    })

    it('失败响应应该 data 为 null error 有值', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ code: 10001, message: '用户不存在' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        })
      )

      const api = eden<TestContract>(createClient('http://localhost:3000'))
      const result = await api.users({ id: '999' }).get()
      
      expect(result.data).toBeNull()
      expect(result.error).toEqual({ code: 10001, message: '用户不存在' })
    })
  })

  // ============= Query 参数测试 =============

  describe('Query 参数', () => {
    it('应该正确构建查询字符串', async () => {
      const api = eden<TestContract>(createClient('http://localhost:3000'))
      
      await api.users.get({ page: 2 })
      
      const req = mockFetch.mock.calls[0][0] as Request
      const url = new URL(req.url)
      expect(url.searchParams.get('page')).toBe('2')
    })

    it('应该忽略 undefined 和 null 值', async () => {
      // 直接使用 TestContract，测试 users.get
      const api = eden<TestContract>(createClient('http://localhost:3000'))
      
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

    const api = eden<SSEContract>(createClient('http://localhost:3000'))
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

    const api = eden<SSEContract>(createClient('http://localhost:3000'))
    
    const sub = api.events.subscribe({
      onMessage: () => {}
    })

    expect(sub.connected).toBe(false) // 还在连接中
    
    sub.unsubscribe()
    expect(sub.connected).toBe(false)
  })
})
