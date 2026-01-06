import { describe, expect, it, beforeEach } from 'vitest'
import { VafastApiClient } from '../src'

describe('VafastApiClient', () => {
  let client: VafastApiClient

  beforeEach(() => {
    client = new VafastApiClient({
      baseURL: 'https://api.example.com',
      timeout: 5000,
      retries: 2
    })
  })

  it('should create client with default config', () => {
    const defaultClient = new VafastApiClient()
    expect(defaultClient).toBeDefined()
  })

  it('should create client with custom config', () => {
    expect(client).toBeDefined()
  })

  it('should add and remove middleware', () => {
    const middleware = {
      name: 'test',
      onRequest: async (req: Request) => req
    }

    client.addMiddleware(middleware)
    expect(client.getCacheStats()).toBeDefined()

    client.removeMiddleware('test')
    expect(client.getCacheStats()).toBeDefined()
  })

  it('should add and remove interceptor', () => {
    const interceptor = {
      request: async (config: any) => config
    }

    client.addInterceptor(interceptor)
    expect(client.getCacheStats()).toBeDefined()

    client.removeInterceptor(0)
    expect(client.getCacheStats()).toBeDefined()
  })

  it('should clear cache', () => {
    client.clearCache()
    const stats = client.getCacheStats()
    expect(stats.size).toBe(0)
    expect(stats.keys).toEqual([])
  })
})
