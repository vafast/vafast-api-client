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
        // 新的 SSE 定义：sse 作为一等公民方法
        sse: { query: { prompt: string }; return: string }
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
      // GET 请求不应设置 Content-Type（因为没有 body）
      expect(req.headers.get('Content-Type')).toBeNull()
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

      mockFetch.mockImplementation((input: Request | string) => {
        const signal = input instanceof Request ? input.signal : undefined
        return new Promise((_, reject) => {
          // 检查是否已经 aborted
          if (signal?.aborted) {
            const error = new Error('This operation was aborted')
            error.name = 'AbortError'
            reject(error)
            return
          }
          // 添加 abort 监听器
          signal?.addEventListener('abort', () => {
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
      // 主动取消返回 code: 0, type: 'abort'
      expect(result.error?.code).toBe(0)
      expect(result.error?.type).toBe('abort')
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
        message: '用户不存在',
        type: 'server'
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
      expect(result.error).toEqual({ code: 10001, message: '用户不存在', type: 'server' })
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

  // ============= HEAD 和 OPTIONS 方法测试 =============

  describe('HEAD 和 OPTIONS 方法', () => {
    interface ExtendedContract {
      users: {
        head: { return: void }
        options: { return: { allow: string[] } }
        ':id': {
          head: { return: void }
        }
      }
    }

    it('应该发送 HEAD 请求', async () => {
      const api = eden<ExtendedContract>(createClient('http://localhost:3000'))

      await api.users.head()

      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.method).toBe('HEAD')
      expect(req.url).toContain('/users')
    })

    it('应该发送 OPTIONS 请求', async () => {
      const api = eden<ExtendedContract>(createClient('http://localhost:3000'))

      await api.users.options()

      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.method).toBe('OPTIONS')
      expect(req.url).toContain('/users')
    })

    it('HEAD 请求应该支持路径参数', async () => {
      const api = eden<ExtendedContract>(createClient('http://localhost:3000'))

      await api.users({ id: '123' }).head()

      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.method).toBe('HEAD')
      expect(req.url).toBe('http://localhost:3000/users/123')
    })
  })

  // ============= POST + Query 参数测试 =============

  describe('POST + Query 参数', () => {
    it('应该支持 POST 请求同时携带 body 和 query', async () => {
      const api = eden<TestContract>(createClient('http://localhost:3000'))

      await api.users.post(
        { name: 'John' },
        { query: { notify: 'true', source: 'web' } }
      )

      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.method).toBe('POST')

      // 验证 URL 包含 query 参数
      const url = new URL(req.url)
      expect(url.searchParams.get('notify')).toBe('true')
      expect(url.searchParams.get('source')).toBe('web')

      // 验证 body 内容
      const body = await req.text()
      expect(JSON.parse(body)).toEqual({ name: 'John' })
    })

    it('应该支持 PUT 请求同时携带 body 和 query', async () => {
      const api = eden<TestContract>(createClient('http://localhost:3000'))

      await api.users({ id: '123' }).put(
        { name: 'Jane' },
        { query: { version: '2' } }
      )

      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.method).toBe('PUT')
      expect(req.url).toContain('/users/123')

      const url = new URL(req.url)
      expect(url.searchParams.get('version')).toBe('2')
    })

    it('POST 请求没有 query 配置时不应该有查询字符串', async () => {
      const api = eden<TestContract>(createClient('http://localhost:3000'))

      await api.users.post({ name: 'John' })

      const req = mockFetch.mock.calls[0][0] as Request
      const url = new URL(req.url)
      expect(url.search).toBe('')
    })
  })

  // ============= Content-Type 测试 =============

  describe('Content-Type 处理', () => {
    it('GET 请求不应该设置 Content-Type', async () => {
      const api = eden<TestContract>(createClient('http://localhost:3000'))

      await api.users.get({ page: 1 })

      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.headers.get('Content-Type')).toBeNull()
    })

    it('HEAD 请求不应该设置 Content-Type', async () => {
      interface HeadContract {
        users: {
          head: { return: void }
        }
      }
      const api = eden<HeadContract>(createClient('http://localhost:3000'))

      await api.users.head()

      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.headers.get('Content-Type')).toBeNull()
    })

    it('POST 请求应该设置 Content-Type: application/json', async () => {
      const api = eden<TestContract>(createClient('http://localhost:3000'))

      await api.users.post({ name: 'John' })

      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.headers.get('Content-Type')).toBe('application/json')
    })

    it('PUT 请求应该设置 Content-Type: application/json', async () => {
      const api = eden<TestContract>(createClient('http://localhost:3000'))

      await api.users({ id: '123' }).put({ name: 'Jane' })

      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.headers.get('Content-Type')).toBe('application/json')
    })

    it('DELETE 请求不带 body 时不应该设置 Content-Type', async () => {
      const api = eden<TestContract>(createClient('http://localhost:3000'))

      await api.users({ id: '123' }).delete()

      const req = mockFetch.mock.calls[0][0] as Request
      // DELETE 不带 body 时不设置 Content-Type
      expect(req.headers.get('Content-Type')).toBeNull()
    })
  })

  // ============= 数组和嵌套对象 Query 参数测试 =============

  describe('复杂 Query 参数', () => {
    interface ComplexQueryContract {
      search: {
        get: {
          query: {
            tags?: string[]
            filter?: { status?: string; type?: string }
            ids?: number[]
          }
          return: unknown[]
        }
      }
    }

    it('应该正确序列化数组参数', async () => {
      const api = eden<ComplexQueryContract>(createClient('http://localhost:3000'))

      await api.search.get({ tags: ['a', 'b', 'c'] })

      const req = mockFetch.mock.calls[0][0] as Request
      const url = new URL(req.url)
      // qs 使用 indices 格式：tags[0]=a&tags[1]=b&tags[2]=c
      expect(url.searchParams.get('tags[0]')).toBe('a')
      expect(url.searchParams.get('tags[1]')).toBe('b')
      expect(url.searchParams.get('tags[2]')).toBe('c')
    })

    it('应该正确序列化嵌套对象参数', async () => {
      const api = eden<ComplexQueryContract>(createClient('http://localhost:3000'))

      await api.search.get({ filter: { status: 'active', type: 'user' } })

      const req = mockFetch.mock.calls[0][0] as Request
      const url = new URL(req.url)
      expect(url.searchParams.get('filter[status]')).toBe('active')
      expect(url.searchParams.get('filter[type]')).toBe('user')
    })

    it('应该正确序列化数字数组参数', async () => {
      const api = eden<ComplexQueryContract>(createClient('http://localhost:3000'))

      await api.search.get({ ids: [1, 2, 3] })

      const req = mockFetch.mock.calls[0][0] as Request
      const url = new URL(req.url)
      expect(url.searchParams.get('ids[0]')).toBe('1')
      expect(url.searchParams.get('ids[1]')).toBe('2')
      expect(url.searchParams.get('ids[2]')).toBe('3')
    })
  })
})

// ============= SSE 测试 =============

describe('SSE 订阅', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('应该调用 sse 方法', async () => {
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

    // 链式调用：.get().sse()
    interface SSEContract {
      events: {
        get: { query: { channel: string }; return: { message: string } }
      }
    }

    const api = eden<SSEContract>(createClient('http://localhost:3000'))
    const onMessage = vi.fn()
    const onClose = vi.fn()

    await new Promise<void>((resolve) => {
      api.events.get({ channel: 'test' }).sse({
        onMessage,
        onClose: () => {
          onClose()
          resolve()
        }
      })
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

    // 链式调用：.get().sse()（无参数）
    interface SSEContract {
      events: {
        get: { return: unknown }
      }
    }

    const api = eden<SSEContract>(createClient('http://localhost:3000'))

    const sub = api.events.get().sse({
      onMessage: () => { }
    })

    expect(sub.connected).toBe(false) // 还在连接中

    sub.unsubscribe()
    expect(sub.connected).toBe(false)
  })

  it('应该支持 POST SSE (带 body)', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"content":"Hello!"}\n\n'))
        controller.close()
      }
    })

    mockFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      })
    )

    // 链式调用：.post().sse()
    interface SSEContract {
      chat: {
        stream: {
          post: {
            body: { messages: Array<{ role: string; content: string }> }
            return: { content: string }
          }
        }
      }
    }

    const api = eden<SSEContract>(createClient('http://localhost:3000'))
    const onMessage = vi.fn()
    const onClose = vi.fn()

    await new Promise<void>((resolve) => {
      api.chat.stream.post({ messages: [{ role: 'user', content: '你好' }] }).sse({
        onMessage,
        onClose: () => {
          onClose()
          resolve()
        }
      })
    })

    // 验证使用了 POST 方法和 body（fetch 收到 Request 对象）
    const req = mockFetch.mock.calls[0][0] as Request
    expect(req.method).toBe('POST')
    expect(await req.text()).toBe(JSON.stringify({ messages: [{ role: 'user', content: '你好' }] }))
    expect(req.headers.get('Content-Type')).toBe('application/json')
    expect(req.headers.get('Accept')).toBe('text/event-stream')
    expect(onMessage).toHaveBeenCalledWith({ content: 'Hello!' })
  })

  it('应该支持 DELETE SSE (批量删除进度)', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"deleted":1,"total":3}\n\n'))
        controller.enqueue(encoder.encode('data: {"deleted":2,"total":3}\n\n'))
        controller.enqueue(encoder.encode('data: {"deleted":3,"total":3}\n\n'))
        controller.close()
      }
    })

    mockFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      })
    )

    // 链式调用：.delete().sse()
    interface SSEContract {
      batch: {
        delete: {
          body: { ids: string[] }
          return: { deleted: number; total: number }
        }
      }
    }

    const api = eden<SSEContract>(createClient('http://localhost:3000'))
    const messages: Array<{ deleted: number; total: number }> = []

    await new Promise<void>((resolve) => {
      api.batch.delete({ ids: ['1', '2', '3'] }).sse({
        onMessage: (data) => messages.push(data),
        onClose: resolve
      })
    })

    const req = mockFetch.mock.calls[0][0] as Request
    expect(req.method).toBe('DELETE')
    expect(await req.text()).toBe(JSON.stringify({ ids: ['1', '2', '3'] }))
    expect(messages).toHaveLength(3)
    expect(messages[2]).toEqual({ deleted: 3, total: 3 })
  })

  it('应该支持 POST SSE 带额外 query 参数', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"ok":true}\n\n'))
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
      api: {
        search: {
          post: {
            body: { query: string }
            return: { ok: boolean }
          }
        }
      }
    }

    const api = eden<SSEContract>(createClient('http://localhost:3000'))

    await new Promise<void>((resolve) => {
      // POST + query 通过 config.query 传递
      api.api.search.post({ query: 'test' }, { query: { page: 2 } }).sse({
        onMessage: () => { },
        onClose: resolve
      })
    })

    // 验证 URL 包含 query 参数，body 包含数据
    const req = mockFetch.mock.calls[0][0] as Request
    expect(req.url).toContain('page=2')
    expect(req.method).toBe('POST')
    expect(await req.text()).toBe(JSON.stringify({ query: 'test' }))
  })

  it('应该支持 params 路径参数', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"roomId":"room-123","message":"hello"}\n\n'))
        controller.close()
      }
    })

    mockFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      })
    )

    // 链式调用：带 params 的 .get().sse()
    interface SSEContract {
      rooms: {
        ':id': {
          messages: {
            get: {
              query: { since?: string }
              return: { roomId: string; message: string }
            }
          }
        }
      }
    }

    const api = eden<SSEContract>(createClient('http://localhost:3000'))
    const onMessage = vi.fn()

    await new Promise<void>((resolve) => {
      api.rooms({ id: 'room-123' }).messages.get({ since: '2024-01-01' }).sse({
        onMessage,
        onClose: resolve
      })
    })

    // 验证 URL 包含 params
    const req = mockFetch.mock.calls[0][0] as Request
    expect(req.url).toContain('/rooms/room-123/messages')
    expect(req.url).toContain('since=2024-01-01')
    expect(onMessage).toHaveBeenCalledWith({ roomId: 'room-123', message: 'hello' })
  })

  it('应该支持 PUT SSE', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"progress":100}\n\n'))
        controller.close()
      }
    })

    mockFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      })
    )

    // 链式调用：.put().sse()
    interface SSEContract {
      files: {
        upload: {
          put: {
            body: { filename: string }
            return: { progress: number }
          }
        }
      }
    }

    const api = eden<SSEContract>(createClient('http://localhost:3000'))

    await new Promise<void>((resolve) => {
      api.files.upload.put({ filename: 'test.txt' }).sse({
        onMessage: () => { },
        onClose: resolve
      })
    })

    const req = mockFetch.mock.calls[0][0] as Request
    expect(req.method).toBe('PUT')
    expect(await req.text()).toBe(JSON.stringify({ filename: 'test.txt' }))
  })

  it('应该支持 PATCH SSE', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"updated":true}\n\n'))
        controller.close()
      }
    })

    mockFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      })
    )

    // 链式调用：.patch().sse()
    interface SSEContract {
      users: {
        sync: {
          patch: {
            body: { fields: string[] }
            return: { updated: boolean }
          }
        }
      }
    }

    const api = eden<SSEContract>(createClient('http://localhost:3000'))

    await new Promise<void>((resolve) => {
      api.users.sync.patch({ fields: ['name', 'email'] }).sse({
        onMessage: () => { },
        onClose: resolve
      })
    })

    const req = mockFetch.mock.calls[0][0] as Request
    expect(req.method).toBe('PATCH')
  })

  it('应该解析 SSE event 字段', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: custom\ndata: {"type":"custom"}\n\n'))
        controller.enqueue(encoder.encode('event: error\ndata: {"message":"test error"}\n\n'))
        controller.close()
      }
    })

    mockFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      })
    )

    // 链式调用：.get().sse()
    interface SSEContract {
      events: {
        get: { return: { type?: string; message?: string } }
      }
    }

    const api = eden<SSEContract>(createClient('http://localhost:3000'))
    const onMessage = vi.fn()
    const onError = vi.fn()

    await new Promise<void>((resolve) => {
      api.events.get().sse({
        onMessage,
        onError,
        onClose: resolve
      })
    })

    // custom 事件应该被 onMessage 处理
    expect(onMessage).toHaveBeenCalledWith({ type: 'custom' })
    // error 事件应该被 onError 处理
    expect(onError).toHaveBeenCalled()
  })

  it('应该处理 HTTP 错误', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    )

    // 链式调用：.get().sse()
    interface SSEContract {
      events: {
        get: { return: unknown }
      }
    }

    const api = eden<SSEContract>(createClient('http://localhost:3000'))
    const onError = vi.fn()

    await new Promise<void>((resolve) => {
      api.events.get().sse({
        onMessage: () => { },
        onError: (err) => {
          onError(err)
          resolve()
        }
      })
    })

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('401')
      })
    )
  })

  it('应该支持无参数 SSE', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"ping":"pong"}\n\n'))
        controller.close()
      }
    })

    mockFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      })
    )

    // 链式调用：.get().sse()（无参数）
    interface SSEContract {
      heartbeat: {
        get: { return: { ping: string } }
      }
    }

    const api = eden<SSEContract>(createClient('http://localhost:3000'))
    const onMessage = vi.fn()

    await new Promise<void>((resolve) => {
      api.heartbeat.get().sse({
        onMessage,
        onClose: resolve
      })
    })

    expect(onMessage).toHaveBeenCalledWith({ ping: 'pong' })
  })

  it('SSE 应该走完整中间件链', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"message":"hi"}\n\n'))
        controller.close()
      }
    })

    mockFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      })
    )

    // 链式调用：.get().sse() + 中间件
    interface SSEContract {
      events: {
        get: { return: { message: string } }
      }
    }

    const middlewareCalled = vi.fn()

    const client = createClient('http://localhost:3000')
      .use(async (ctx, next) => {
        middlewareCalled(ctx.method, ctx.path)
        ctx.headers.set('Authorization', 'Bearer test-token')
        ctx.headers.set('X-Custom', 'custom-value')
        return next()
      })

    const api = eden<SSEContract>(client)

    await new Promise<void>((resolve) => {
      api.events.get().sse({
        onMessage: () => { },
        onClose: resolve
      })
    })

    // 验证中间件被调用
    expect(middlewareCalled).toHaveBeenCalledWith('GET', '/events')

    // 验证中间件添加的 headers
    const req = mockFetch.mock.calls[0][0] as Request
    expect(req.headers.get('Authorization')).toBe('Bearer test-token')
    expect(req.headers.get('X-Custom')).toBe('custom-value')
  })

  it('POST SSE 应该走中间件链并正确传递 body', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"result":"ok"}\n\n'))
        controller.close()
      }
    })

    mockFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      })
    )

    // 链式调用：.post().sse() + 中间件
    interface SSEContract {
      chat: {
        post: { body: { prompt: string }; return: { result: string } }
      }
    }

    const middlewareCalled = vi.fn()

    const client = createClient('http://localhost:3000')
      .use(async (ctx, next) => {
        middlewareCalled(ctx.method, ctx.path, ctx.body)
        return next()
      })

    const api = eden<SSEContract>(client)

    await new Promise<void>((resolve) => {
      api.chat.post({ prompt: 'hello' }).sse({
        onMessage: () => { },
        onClose: resolve
      })
    })

    // 验证中间件收到了正确的 body
    expect(middlewareCalled).toHaveBeenCalledWith('POST', '/chat', { prompt: 'hello' })
  })
})

// ============= requestRaw 测试 =============

describe('requestRaw', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('应该返回原始 Response 对象', async () => {
    const responseBody = 'raw response body'
    mockFetch.mockResolvedValue(
      new Response(responseBody, { status: 200 })
    )

    const client = createClient('http://localhost:3000')
    const response = await client.requestRaw('GET', '/test')

    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(responseBody)
  })

  it('应该走中间件链', async () => {
    mockFetch.mockResolvedValue(new Response('ok', { status: 200 }))

    const middlewareCalled = vi.fn()

    const client = createClient('http://localhost:3000')
      .use(async (ctx, next) => {
        middlewareCalled(ctx.method, ctx.path)
        ctx.headers.set('X-Test', 'test-value')
        return next()
      })

    await client.requestRaw('POST', '/api/stream', { data: 'test' })

    expect(middlewareCalled).toHaveBeenCalledWith('POST', '/api/stream')

    const req = mockFetch.mock.calls[0][0] as Request
    expect(req.headers.get('X-Test')).toBe('test-value')
  })

  it('应该正确处理 query 参数', async () => {
    mockFetch.mockResolvedValue(new Response('ok', { status: 200 }))

    const client = createClient('http://localhost:3000')
    await client.requestRaw('GET', '/search', null, {
      query: { q: 'test', page: 1 }
    })

    const req = mockFetch.mock.calls[0][0] as Request
    expect(req.url).toContain('q=test')
    expect(req.url).toContain('page=1')
  })

  it('应该正确处理 POST body', async () => {
    mockFetch.mockResolvedValue(new Response('ok', { status: 200 }))

    const client = createClient('http://localhost:3000')
    await client.requestRaw('POST', '/data', { name: 'test' })

    const req = mockFetch.mock.calls[0][0] as Request
    expect(req.method).toBe('POST')
    expect(await req.text()).toBe(JSON.stringify({ name: 'test' }))
  })
})

// ============= RequestBuilder 懒执行测试 =============

describe('RequestBuilder 懒执行', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('创建 builder 时不应该发起请求', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ id: 1 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))

    interface Contract {
      users: { get: { return: { id: number } } }
    }

    const api = eden<Contract>(createClient('http://localhost:3000'))

    // 创建 builder，但不 await
    const builder = api.users.get()

    // 此时不应该发起请求
    expect(mockFetch).not.toHaveBeenCalled()

    // await 时才发起请求
    await builder
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('多次 await 同一个 builder 只应该发起一次请求', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ id: 1 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))

    interface Contract {
      users: { get: { return: { id: number } } }
    }

    const api = eden<Contract>(createClient('http://localhost:3000'))
    const builder = api.users.get()

    // 多次 await
    await builder
    await builder
    await builder

    // 只应该发起一次请求
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('调用 .sse() 时不应该先发起普通请求', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"msg":"hi"}\n\n'))
        controller.close()
      }
    })

    mockFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' }
      })
    )

    interface Contract {
      chat: { post: { body: { message: string }; return: { msg: string } } }
    }

    const api = eden<Contract>(createClient('http://localhost:3000'))

    await new Promise<void>((resolve) => {
      // 直接调用 .sse()，不 await
      api.chat.post({ message: 'hi' }).sse({
        onMessage: () => { },
        onClose: resolve
      })
    })

    // 只应该发起一次 SSE 请求
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const req = mockFetch.mock.calls[0][0] as Request
    expect(req.method).toBe('POST')
  })

  it('await 和 .sse() 是独立的请求', async () => {
    let callCount = 0
    mockFetch.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // 第一次是普通请求
        return Promise.resolve(new Response(JSON.stringify({ id: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }))
      } else {
        // 第二次是 SSE 请求
        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"msg":"hi"}\n\n'))
            controller.close()
          }
        })
        return Promise.resolve(new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' }
        }))
      }
    })

    interface Contract {
      users: { post: { body: { name: string }; return: { id: number } } }
    }

    const api = eden<Contract>(createClient('http://localhost:3000'))
    const builder = api.users.post({ name: 'John' })

    // 先 await
    await builder
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // 再调用 .sse()（会发起新的请求）
    await new Promise<void>((resolve) => {
      builder.sse({
        onMessage: () => { },
        onClose: resolve
      })
    })

    // 总共应该发起两次请求
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
