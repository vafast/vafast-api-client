import { describe, expect, it } from 'vitest'
import {
  buildQueryString,
  replacePathParams,
  isFile,
  isFileUpload,
  hasFiles,
  createFormData,
  deepMerge,
  delay,
  exponentialBackoff,
  validateStatus,
  parseResponse,
  createError,
  cloneRequest,
  isRetryableError
} from '../src'

describe('Utils', () => {
  describe('buildQueryString', () => {
    it('should build query string from object', () => {
      const params = { page: 1, limit: 10, search: 'john' }
      const result = buildQueryString(params)
      expect(result).toBe('?page=1&limit=10&search=john')
    })

    it('should handle empty object', () => {
      const result = buildQueryString({})
      expect(result).toBe('')
    })

    it('should handle undefined and null values', () => {
      const params = { page: 1, limit: undefined, search: null, active: true }
      const result = buildQueryString(params)
      expect(result).toBe('?page=1&active=true')
    })

    it('should handle array values', () => {
      const params = { tags: ['js', 'ts'], page: 1 }
      const result = buildQueryString(params)
      expect(result).toBe('?tags=js&tags=ts&page=1')
    })

    it('should handle boolean values', () => {
      const params = { active: true, verified: false }
      const result = buildQueryString(params)
      expect(result).toBe('?active=true&verified=false')
    })
  })

  describe('replacePathParams', () => {
    it('should replace path parameters', () => {
      const path = '/users/:id/posts/:postId'
      const params = { id: '123', postId: '456' }
      const result = replacePathParams(path, params)
      expect(result).toBe('/users/123/posts/456')
    })

    it('should handle path with no parameters', () => {
      const path = '/users'
      const params = {}
      const result = replacePathParams(path, params)
      expect(result).toBe('/users')
    })

    it('should handle numeric parameters', () => {
      const path = '/users/:id'
      const params = { id: 123 }
      const result = replacePathParams(path, params)
      expect(result).toBe('/users/123')
    })

    it('should handle missing parameters', () => {
      const path = '/users/:id/posts/:postId'
      const params = { id: '123' }
      const result = replacePathParams(path, params)
      expect(result).toBe('/users/123/posts/:postId')
    })
  })

  describe('isFile', () => {
    it('should identify File objects', () => {
      const file = new File(['content'], 'test.txt')
      expect(isFile(file)).toBe(true)
    })

    it('should identify Blob objects', () => {
      const blob = new Blob(['content'])
      expect(isFile(blob)).toBe(true)
    })

    it('should reject non-file objects', () => {
      expect(isFile('string')).toBe(false)
      expect(isFile(123)).toBe(false)
      expect(isFile({})).toBe(false)
      expect(isFile(null)).toBe(false)
      expect(isFile(undefined)).toBe(false)
    })
  })

  describe('isFileUpload', () => {
    it('should identify FileUpload objects', () => {
      const fileUpload = {
        file: new File(['content'], 'test.txt'),
        filename: 'custom.txt',
        contentType: 'text/plain'
      }
      expect(isFileUpload(fileUpload)).toBe(true)
    })

    it('should reject non-FileUpload objects', () => {
      expect(isFileUpload({})).toBe(false)
      expect(isFileUpload({ file: 'string' })).toBe(false)
      expect(isFileUpload(null)).toBe(false)
      expect(isFileUpload(undefined)).toBe(false)
    })
  })

  describe('hasFiles', () => {
    it('should detect files in object', () => {
      const obj = {
        name: 'test',
        file: new File(['content'], 'test.txt'),
        metadata: { size: 100 }
      }
      expect(hasFiles(obj)).toBe(true)
    })

    it('should detect files in nested objects', () => {
      const obj = {
        user: {
          avatar: new File(['content'], 'avatar.jpg'),
          profile: { name: 'John' }
        }
      }
      expect(hasFiles(obj)).toBe(true)
    })

    it('should detect files in arrays', () => {
      const obj = {
        files: [new File(['content'], 'file1.txt'), new File(['content'], 'file2.txt')]
      }
      expect(hasFiles(obj)).toBe(true)
    })

    it('should not detect files in object without files', () => {
      const obj = {
        name: 'test',
        age: 25,
        active: true
      }
      expect(hasFiles(obj)).toBe(false)
    })
  })

  describe('createFormData', () => {
    it('should create FormData from object', () => {
      const data = {
        name: 'John',
        age: 25,
        file: new File(['content'], 'test.txt')
      }
      const formData = createFormData(data)
      expect(formData).toBeInstanceOf(globalThis.FormData)
    })

    it('should handle FileUpload objects', () => {
      const data = {
        name: 'John',
        avatar: {
          file: new File(['content'], 'avatar.jpg'),
          filename: 'custom.jpg'
        }
      }
      const formData = createFormData(data)
      expect(formData).toBeInstanceOf(globalThis.FormData)
    })

    it('should handle array values', () => {
      const data = {
        tags: ['js', 'ts'],
        files: [new File(['content'], 'file1.txt'), new File(['content'], 'file2.txt')]
      }
      const formData = createFormData(data)
      expect(formData).toBeInstanceOf(globalThis.FormData)
    })

    it('should skip undefined and null values', () => {
      const data = {
        name: 'John',
        age: undefined,
        email: null,
        active: true
      }
      const formData = createFormData(data)
      expect(formData).toBeInstanceOf(globalThis.FormData)
    })
  })

  describe('deepMerge', () => {
    it('should merge objects deeply', () => {
      const target = { a: 1, b: { c: 2, d: 3 } }
      const source = { b: { d: 4, e: 5 }, f: 6 }
      const result = deepMerge(target, source)
      expect(result).toEqual({ a: 1, b: { c: 2, d: 4, e: 5 }, f: 6 })
    })

    it('should not modify original objects', () => {
      const target = { a: 1, b: { c: 2 } }
      const source = { b: { d: 3 } }
      const result = deepMerge(target, source)
      expect(target).toEqual({ a: 1, b: { c: 2 } })
      expect(result).toEqual({ a: 1, b: { c: 2, d: 3 } })
    })

    it('should handle empty objects', () => {
      const target = {}
      const source = {}
      const result = deepMerge(target, source)
      expect(result).toEqual({})
    })

    it('should handle null and undefined', () => {
      const target = { a: 1, b: { c: 2 } }
      const source = { b: null, c: undefined }
      const result = deepMerge(target, source)
      expect(result).toEqual({ a: 1, b: null, c: undefined })
    })
  })

  describe('delay', () => {
    it('should delay execution', async () => {
      const start = Date.now()
      await delay(100)
      const end = Date.now()
      expect(end - start).toBeGreaterThanOrEqual(90)
    })
  })

  describe('exponentialBackoff', () => {
    it('should calculate exponential backoff', () => {
      const result1 = exponentialBackoff(1, 1000, 10000)
      const result2 = exponentialBackoff(2, 1000, 10000)
      const result3 = exponentialBackoff(3, 1000, 10000)

      expect(result1).toBeGreaterThanOrEqual(1000)
      expect(result2).toBeGreaterThanOrEqual(2000)
      expect(result3).toBeGreaterThanOrEqual(4000)
    })

    it('should respect max delay', () => {
      const result = exponentialBackoff(10, 1000, 5000)
      // Allow some tolerance for random jitter
      expect(result).toBeLessThanOrEqual(6000)
    })
  })

  describe('validateStatus', () => {
    it('should validate successful status codes', () => {
      expect(validateStatus(200)).toBe(true)
      expect(validateStatus(201)).toBe(true)
      expect(validateStatus(299)).toBe(true)
    })

    it('should reject error status codes', () => {
      expect(validateStatus(400)).toBe(false)
      expect(validateStatus(500)).toBe(false)
      expect(validateStatus(404)).toBe(false)
    })
  })

  describe('parseResponse', () => {
    it('should parse JSON responses', async () => {
      const response = new Response(JSON.stringify({ data: 'test' }), {
        headers: { 'Content-Type': 'application/json' }
      })
      const result = await parseResponse(response)
      expect(result).toEqual({ data: 'test' })
    })

    it('should parse text responses', async () => {
      const response = new Response('Hello World', {
        headers: { 'Content-Type': 'text/plain' }
      })
      const result = await parseResponse(response)
      expect(result).toBe('Hello World')
    })

    it('should parse array buffer responses', async () => {
      const buffer = new ArrayBuffer(8)
      const response = new Response(buffer, {
        headers: { 'Content-Type': 'application/octet-stream' }
      })
      const result = await parseResponse(response)
      expect(result).toBeInstanceOf(ArrayBuffer)
    })

    it('should handle responses without content-type', async () => {
      const response = new Response('Hello World')
      const result = await parseResponse(response)
      expect(result).toBe('Hello World')
    })
  })

  describe('createError', () => {
    it('should create error with status and data', () => {
      const error = createError(404, 'Not Found', { resource: 'user' })
      expect(error).toBeInstanceOf(Error)
      expect((error as any).status).toBe(404)
      expect((error as any).data).toEqual({ resource: 'user' })
      expect((error as any).name).toBe('ApiError')
    })

    it('should create error without data', () => {
      const error = createError(500, 'Internal Server Error')
      expect(error).toBeInstanceOf(Error)
      expect((error as any).status).toBe(500)
      expect((error as any).data).toBeUndefined()
    })
  })

  describe('cloneRequest', () => {
    it('should clone request object', () => {
      // Use GET request without body to avoid duplex option requirement in Node.js
      const original = new Request('https://example.com', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      const cloned = cloneRequest(original)
      expect(cloned).toBeInstanceOf(Request)
      expect(cloned.url).toBe(original.url)
      expect(cloned.method).toBe(original.method)
    })
  })

  describe('isRetryableError', () => {
    it('should identify retryable HTTP status codes', () => {
      expect(isRetryableError(new Error(), 408)).toBe(true)
      expect(isRetryableError(new Error(), 429)).toBe(true)
      expect(isRetryableError(new Error(), 500)).toBe(true)
      expect(isRetryableError(new Error(), 502)).toBe(true)
      expect(isRetryableError(new Error(), 503)).toBe(true)
      expect(isRetryableError(new Error(), 504)).toBe(true)
    })

    it('should reject non-retryable status codes', () => {
      expect(isRetryableError(new Error(), 400)).toBe(false)
      expect(isRetryableError(new Error(), 401)).toBe(false)
      expect(isRetryableError(new Error(), 403)).toBe(false)
      expect(isRetryableError(new Error(), 404)).toBe(false)
    })

    it('should identify network errors as retryable', () => {
      const networkError = new Error('fetch failed')
      expect(isRetryableError(networkError)).toBe(true)
    })

    it('should reject other errors as non-retryable', () => {
      const otherError = new Error('Validation failed')
      expect(isRetryableError(otherError)).toBe(false)
    })
  })
})
