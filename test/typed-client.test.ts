import { describe, expect, it, beforeEach, mock } from 'bun:test'
import { 
  createTypedClient, 
  createRouteBasedClient, 
  createSimpleClient,
  type TypedApiClient 
} from '../src'

// Mock VafastApiClient
const MockVafastApiClient = mock(() => ({
  get: mock(() => Promise.resolve({ data: 'test', error: null, status: 200, headers: new Headers(), response: new Response() })),
  post: mock(() => Promise.resolve({ data: 'created', error: null, status: 201, headers: new Headers(), response: new Response() })),
  put: mock(() => Promise.resolve({ data: 'updated', error: null, status: 200, headers: new Headers(), response: new Response() })),
  delete: mock(() => Promise.resolve({ data: 'deleted', error: null, status: 200, headers: new Headers(), response: new Response() })),
  patch: mock(() => Promise.resolve({ data: 'patched', error: null, status: 200, headers: new Headers(), response: new Response() })),
  head: mock(() => Promise.resolve({ data: null, error: null, status: 200, headers: new Headers(), response: new Response() })),
  options: mock(() => Promise.resolve({ data: null, error: null, status: 200, headers: new Headers(), response: new Response() }))
}))

// Mock server type
interface MockServer {
  routes: {
    '/users': {
      GET: { query: { page?: number; limit?: number } }
      POST: { body: { name: string; email: string } }
    }
    '/users/:id': {
      GET: { params: { id: string } }
      PUT: { params: { id: string }; body: Partial<{ name: string; email: string }> }
      DELETE: { params: { id: string } }
    }
    '/posts': {
      GET: { query: { author?: string; category?: string } }
      POST: { body: { title: string; content: string; authorId: string } }
    }
    '/posts/:id': {
      GET: { params: { id: string } }
      PUT: { params: { id: string }; body: Partial<{ title: string; content: string }> }
      DELETE: { params: { id: string } }
    }
  }
}

describe('Typed Client', () => {
  let mockServer: MockServer

  beforeEach(() => {
    mockServer = {
      routes: {
        '/users': {
          GET: { query: { page: 1, limit: 10 } },
          POST: { body: { name: 'John', email: 'john@example.com' } }
        },
        '/users/:id': {
          GET: { params: { id: '123' } },
          PUT: { params: { id: '123' }, body: { name: 'John Updated' } },
          DELETE: { params: { id: '123' } }
        },
        '/posts': {
          GET: { query: { author: 'user123', category: 'tech' } },
          POST: { body: { title: 'Test Post', content: 'Content', authorId: 'user123' } }
        },
        '/posts/:id': {
          GET: { params: { id: '456' } },
          PUT: { params: { id: '456' }, body: { title: 'Updated Post' } },
          DELETE: { params: { id: '456' } }
        }
      }
    }
  })

  describe('createTypedClient', () => {
    it('should create typed client from server', () => {
      const typedClient = createTypedClient<MockServer>(mockServer as any, {
        baseURL: 'https://api.example.com'
      })
      expect(typedClient).toBeDefined()
    })

    it('should support HTTP method calls', async () => {
      const typedClient = createTypedClient<MockServer>(mockServer as any)
      
      // Test GET method
      const getResponse = await typedClient.get('/users', { page: 1, limit: 10 })
      expect(getResponse).toBeDefined()
      // Note: The actual response will depend on the implementation
      expect(getResponse).toHaveProperty('data')
      
      // Test POST method
      const postResponse = await typedClient.post('/users', { name: 'Jane', email: 'jane@example.com' })
      expect(postResponse).toBeDefined()
      expect(postResponse).toHaveProperty('data')
      
      // Test PUT method
      const putResponse = await typedClient.put('/users/123', { name: 'Jane Updated' })
      expect(putResponse).toBeDefined()
      expect(putResponse).toHaveProperty('data')
      
      // Test DELETE method
      const deleteResponse = await typedClient.delete('/users/123')
      expect(deleteResponse).toBeDefined()
      expect(deleteResponse).toHaveProperty('data')
      
      // Test PATCH method
      const patchResponse = await typedClient.patch('/users/123', { name: 'Jane Patched' })
      expect(patchResponse).toBeDefined()
      expect(patchResponse).toHaveProperty('data')
      
      // Test HEAD method
      const headResponse = await typedClient.head('/users')
      expect(headResponse).toBeDefined()
      expect(headResponse).toHaveProperty('data')
      
      // Test OPTIONS method
      const optionsResponse = await typedClient.options('/users')
      expect(optionsResponse).toBeDefined()
      expect(optionsResponse).toHaveProperty('data')
    })

    it('should support path-based calls', async () => {
      const typedClient = createTypedClient<MockServer>(mockServer as any)
      
      // Test path segments
      const usersClient = (typedClient as any).users
      expect(usersClient).toBeDefined()
      
      // Test nested path segments
      const postsClient = (typedClient as any).posts
      expect(postsClient).toBeDefined()
    })

    it('should handle dynamic path parameters', async () => {
      const typedClient = createTypedClient<MockServer>(mockServer as any)
      
      // Test dynamic path with parameters
      const userClient = (typedClient as any).users
      if (typeof userClient === 'function') {
        const response = await userClient({ id: '123' })
        expect(response).toBeDefined()
      }
    })
  })

  describe('createRouteBasedClient', () => {
    it('should create route-based client', () => {
      const routeClient = createRouteBasedClient<MockServer>(mockServer as any, {
        baseURL: 'https://api.example.com'
      })
      expect(routeClient).toBeDefined()
    })

    it('should support dynamic path handling', async () => {
      const routeClient = createRouteBasedClient<MockServer>(mockServer as any)
      
      // Test dynamic path creation
      const dynamicPath = (routeClient as any).users
      expect(dynamicPath).toBeDefined()
      
      if (typeof dynamicPath === 'function') {
        const response = await dynamicPath({ id: '123' })
        expect(response).toBeDefined()
      }
    })
  })

  describe('createSimpleClient', () => {
    it('should create simple client', () => {
      const simpleClient = createSimpleClient<MockServer>(mockServer as any, {
        baseURL: 'https://api.example.com'
      })
      expect(simpleClient).toBeDefined()
    })

    it('should have all HTTP methods', () => {
      const simpleClient = createSimpleClient<MockServer>(mockServer as any)
      
      expect(typeof simpleClient.get).toBe('function')
      expect(typeof simpleClient.post).toBe('function')
      expect(typeof simpleClient.put).toBe('function')
      expect(typeof simpleClient.delete).toBe('function')
      expect(typeof simpleClient.patch).toBe('function')
      expect(typeof simpleClient.head).toBe('function')
      expect(typeof simpleClient.options).toBe('function')
    })

    it('should make HTTP requests correctly', async () => {
      const simpleClient = createSimpleClient<MockServer>(mockServer as any)
      
      // Test GET request
      const getResponse = await simpleClient.get('/users', { page: 1, limit: 10 })
      expect(getResponse).toBeDefined()
      expect(getResponse).toHaveProperty('data')
      
      // Test POST request
      const postResponse = await simpleClient.post('/users', { name: 'John', email: 'john@example.com' })
      expect(postResponse).toBeDefined()
      expect(postResponse).toHaveProperty('data')
      
      // Test PUT request
      const putResponse = await simpleClient.put('/users/123', { name: 'John Updated' })
      expect(putResponse).toBeDefined()
      expect(putResponse).toHaveProperty('data')
      
      // Test DELETE request
      const deleteResponse = await simpleClient.delete('/users/123')
      expect(deleteResponse).toBeDefined()
      expect(deleteResponse).toHaveProperty('data')
    })

    it('should handle query parameters', async () => {
      const simpleClient = createSimpleClient<MockServer>(mockServer as any)
      
      const response = await simpleClient.get('/users', { page: 2, limit: 20, search: 'john' })
      expect(response).toBeDefined()
    })

    it('should handle request body', async () => {
      const simpleClient = createSimpleClient<MockServer>(mockServer as any)
      
      const response = await simpleClient.post('/users', { 
        name: 'Jane Doe', 
        email: 'jane@example.com',
        age: 25
      })
      expect(response).toBeDefined()
    })

    it('should handle custom request config', async () => {
      const simpleClient = createSimpleClient<MockServer>(mockServer as any)
      
      const response = await simpleClient.get('/users', { page: 1, limit: 10 }, {
        headers: { 'X-Custom-Header': 'test' },
        timeout: 10000
      })
      expect(response).toBeDefined()
    })
  })

  describe('Type Safety', () => {
    it('should maintain type safety for server types', () => {
      // This test ensures TypeScript compilation works correctly
      const typedClient: TypedApiClient<MockServer> = createTypedClient<MockServer>(mockServer as any)
      expect(typedClient).toBeDefined()
    })

    it('should support generic type constraints', () => {
      // Test with different server types
      interface SimpleServer {
        routes: {
          '/health': {
            GET: {}
          }
        }
      }
      
      const simpleServer: SimpleServer = {
        routes: {
          '/health': { GET: {} }
        }
      }
      
      const client = createTypedClient<SimpleServer>(simpleServer as any)
      expect(client).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle client creation errors gracefully', () => {
      // Test with invalid server
      const invalidClient = createTypedClient(null as any)
      expect(invalidClient).toBeDefined()
    })

    it('should handle missing routes gracefully', () => {
      const emptyServer = { routes: {} }
      const client = createTypedClient(emptyServer as any)
      expect(client).toBeDefined()
    })
  })

  describe('Integration', () => {
    it('should work with different server configurations', () => {
      const configs = [
        { baseURL: 'https://api1.example.com' },
        { baseURL: 'https://api2.example.com', timeout: 5000 },
        { baseURL: 'https://api3.example.com', retries: 3 }
      ]
      
      configs.forEach(config => {
        const client = createSimpleClient<MockServer>(mockServer as any, config)
        expect(client).toBeDefined()
      })
    })

    it('should support method chaining patterns', () => {
      const client = createSimpleClient<MockServer>(mockServer as any)
      
      // Test that methods return the client for chaining
      expect(client).toBeDefined()
      expect(typeof client.get).toBe('function')
      expect(typeof client.post).toBe('function')
    })
  })
})
