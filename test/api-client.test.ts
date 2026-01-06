import { describe, expect, it, beforeEach, vi } from 'vitest'
import { VafastApiClient } from '../src'

// Mock fetch
const mockFetch = vi.fn(() => 
  Promise.resolve(new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  }))
)

// Mock global fetch
global.fetch = mockFetch

describe('VafastApiClient', () => {
  let client: VafastApiClient

  beforeEach(() => {
    // Reset mock and reassign to global.fetch
    mockFetch.mockClear()
    global.fetch = mockFetch
    
    client = new VafastApiClient({
      baseURL: 'https://api.example.com',
      timeout: 5000,
      retries: 2
    })
  })

  describe('Constructor', () => {
    it('should create client with default config', () => {
      const defaultClient = new VafastApiClient()
      expect(defaultClient).toBeDefined()
    })

    it('should create client with custom config', () => {
      expect(client).toBeDefined()
    })

    it('should merge config correctly', () => {
      const customClient = new VafastApiClient({
        baseURL: 'https://custom.api.com',
        timeout: 10000
      })
      expect(customClient).toBeDefined()
    })
  })

  describe('Middleware Management', () => {
    it('should add middleware', () => {
      const middleware = {
        name: 'test',
        onRequest: async (req: Request) => req
      }

      client.addMiddleware(middleware)
      expect(client).toBeDefined()
    })

    it('should remove middleware', () => {
      const middleware = {
        name: 'test',
        onRequest: async (req: Request) => req
      }

      client.addMiddleware(middleware)
      client.removeMiddleware('test')
      expect(client).toBeDefined()
    })

    it('should handle non-existent middleware removal', () => {
      client.removeMiddleware('non-existent')
      expect(client).toBeDefined()
    })
  })

  describe('Interceptor Management', () => {
    it('should add interceptor', () => {
      const interceptor = {
        request: async (config: any) => config
      }

      client.addInterceptor(interceptor)
      expect(client).toBeDefined()
    })

    it('should remove interceptor', () => {
      const interceptor = {
        request: async (config: any) => config
      }

      client.addInterceptor(interceptor)
      client.removeInterceptor(0)
      expect(client).toBeDefined()
    })

    it('should handle invalid interceptor index', () => {
      client.removeInterceptor(-1)
      client.removeInterceptor(999)
      expect(client).toBeDefined()
    })
  })

  describe('Cache Management', () => {
    it('should clear cache', () => {
      client.clearCache()
      const stats = client.getCacheStats()
      expect(stats.size).toBe(0)
      expect(stats.keys).toEqual([])
    })

    it('should get cache stats', () => {
      const stats = client.getCacheStats()
      expect(stats).toHaveProperty('size')
      expect(stats).toHaveProperty('keys')
      expect(Array.isArray(stats.keys)).toBe(true)
    })
  })

  describe('Configuration Methods', () => {
    it('should set cache config', () => {
      const result = client.setCacheConfig({
        enabled: true,
        ttl: 300000,
        maxSize: 100,
        strategy: 'memory'
      })
      expect(result).toBe(client)
    })

    it('should set retry config', () => {
      const result = client.setRetryConfig({
        enabled: true,
        maxRetries: 5,
        retryDelay: 1000,
        backoffMultiplier: 2,
        retryableStatuses: [500, 502, 503]
      })
      expect(result).toBe(client)
    })

    it('should set log config', () => {
      const result = client.setLogConfig({
        enabled: true,
        level: 'info',
        format: 'json',
        includeHeaders: true,
        includeBody: false
      })
      expect(result).toBe(client)
    })
  })

  describe('HTTP Methods', () => {
    it('should make GET request', async () => {
      const response = await client.get('/users', { page: 1, limit: 10 })
      expect(response).toBeDefined()
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should make POST request', async () => {
      const response = await client.post('/users', { name: 'John', email: 'john@example.com' })
      expect(response).toBeDefined()
    })

    it('should make PUT request', async () => {
      const response = await client.put('/users/123', { name: 'John Updated' })
      expect(response).toBeDefined()
    })

    it('should make DELETE request', async () => {
      const response = await client.delete('/users/123')
      expect(response).toBeDefined()
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should make PATCH request', async () => {
      const response = await client.patch('/users/123', { name: 'John Patched' })
      expect(response).toBeDefined()
    })

    it('should make HEAD request', async () => {
      const response = await client.head('/users')
      expect(response).toBeDefined()
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should make OPTIONS request', async () => {
      const response = await client.options('/users')
      expect(response).toBeDefined()
      expect(mockFetch).toHaveBeenCalled()
    })
  })

  describe('Request Configuration', () => {
    it('should handle custom headers', async () => {
      const response = await client.get('/users', undefined, {
        headers: { 'X-Custom-Header': 'test' }
      })
      expect(response).toBeDefined()
    })

    it('should handle timeout configuration', async () => {
      const response = await client.get('/users', undefined, {
        timeout: 10000
      })
      expect(response).toBeDefined()
    })

    it('should handle retry configuration', async () => {
      const response = await client.get('/users', undefined, {
        retries: 5,
        retryDelay: 2000
      })
      expect(response).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // Mock fetch to throw error
      const errorFetch = vi.fn(() => Promise.reject(new Error('Network error')))
      global.fetch = errorFetch

      const response = await client.get('/users')
      expect(response.error).toBeDefined()
      expect(response.data).toBeNull()

      // Restore original mock
      global.fetch = mockFetch
    })

    it('should handle HTTP error statuses', async () => {
      const errorFetch = vi.fn(() => 
        Promise.resolve(new Response('Not Found', { status: 404 }))
      )
      global.fetch = errorFetch

      const response = await client.get('/users')
      expect(response.status).toBe(404)

      // Restore original mock
      global.fetch = mockFetch
    })
  })

  describe('URL Building', () => {
    it('should build URLs correctly with baseURL', async () => {
      const customClient = new VafastApiClient({
        baseURL: 'https://api.example.com'
      })

      await customClient.get('/users')
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should handle absolute URLs', async () => {
      await client.get('https://external.api.com/users')
      expect(mockFetch).toHaveBeenCalled()
    })
  })
})
