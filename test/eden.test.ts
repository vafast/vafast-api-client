import { describe, expect, it, beforeEach, vi } from 'vitest'
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

  interface TestContract {
    users: {
      get: { query: { page?: number }; return: { id: string }[] }
      post: { body: { name: string }; return: { id: string } }
      ':id': {
        get: { return: { id: string; name: string } }
        delete: { return: { success: boolean } }
      }
    }
  }

  describe('basic requests', () => {
    it('should make GET request', async () => {
      const api = eden<TestContract>('http://localhost:3000')
      
      const result = await api.users.get({ page: 1 })
      
      expect(mockFetch).toHaveBeenCalled()
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.url).toContain('/users')
      expect(req.url).toContain('page=1')
      expect(req.method).toBe('GET')
    })

    it('should make POST request', async () => {
      const api = eden<TestContract>('http://localhost:3000')
      
      await api.users.post({ name: 'John' })
      
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.method).toBe('POST')
      expect(req.url).toContain('/users')
    })
  })

  describe('parameterized routes', () => {
    it('should handle params via function call', async () => {
      const api = eden<TestContract>('http://localhost:3000')
      
      await api.users({ id: '123' }).get()
      
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.url).toBe('http://localhost:3000/users/123')
      expect(req.method).toBe('GET')
    })

    it('should handle DELETE with params', async () => {
      const api = eden<TestContract>('http://localhost:3000')
      
      await api.users({ id: '456' }).delete()
      
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.url).toBe('http://localhost:3000/users/456')
      expect(req.method).toBe('DELETE')
    })
  })

  describe('nested routes', () => {
    interface NestedContract {
      users: {
        ':id': {
          posts: {
            get: { return: { id: string }[] }
          }
        }
      }
    }

    it('should handle nested paths with params', async () => {
      const api = eden<NestedContract>('http://localhost:3000')
      
      await api.users({ id: '123' }).posts.get()
      
      const req = mockFetch.mock.calls[0][0] as Request
      expect(req.url).toBe('http://localhost:3000/users/123/posts')
    })
  })
})

