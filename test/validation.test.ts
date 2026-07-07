import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createClient, isValidationError, mapDetailsToFormFields } from '../src'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

describe('validation utils', () => {
  it('mapDetailsToFormFields 转换为表单字段', () => {
    expect(
      mapDetailsToFormFields([
        {
          location: 'body',
          path: '/email',
          field: 'email',
          message: "Expected string to match 'email' format",
        },
        {
          location: 'body',
          path: '/receiver/name',
          field: 'receiver.name',
          message: 'Expected required property',
        },
      ]),
    ).toEqual([
      { field: 'email', message: "Expected string to match 'email' format" },
      { field: 'receiver.name', message: 'Expected required property' },
    ])
  })

  it('isValidationError 识别 422 + details', () => {
    const error = {
      code: 422,
      message: '请求参数校验失败',
      details: [{ location: 'body', path: '/email', field: 'email', message: '无效' }],
    }
    expect(isValidationError(error, 422)).toBe(true)
    expect(isValidationError({ code: 400, message: 'bad' }, 400)).toBe(false)
  })
})

describe('422 details 透传', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('解析并透传 details', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 422,
          message: '请求参数校验失败',
          details: [
            {
              location: 'body',
              path: '/email',
              field: 'email',
              message: "Expected string to match 'email' format",
              value: '2212',
            },
          ],
        }),
        {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    const client = createClient('http://localhost:3000')
    const { error } = await client.request('POST', '/invoice/apply', { email: '2212' })

    expect(error?.code).toBe(422)
    expect(error?.message).toBe('请求参数校验失败')
    expect(error?.details).toHaveLength(1)
    expect(error?.details?.[0]).toMatchObject({
      field: 'email',
      path: '/email',
      message: "Expected string to match 'email' format",
    })
    expect(isValidationError(error, 422)).toBe(true)
  })
})
