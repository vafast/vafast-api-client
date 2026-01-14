/**
 * InferEden 类型推断测试
 * 
 * 测试从 vafast 路由定义自动推断 API 类型
 */
import { describe, it, expectTypeOf } from 'vitest'
import { defineRoute, Type } from 'vafast'
import { InferEden, eden } from '../src'

describe('InferEden 类型推断（使用 vafast）', () => {
  // 使用 vafast 的 defineRoute 定义路由
  const routeDefinitions = [
    defineRoute({
      method: 'GET',
      path: '/users',
      schema: {
        query: Type.Object({
          page: Type.Number(),
          limit: Type.Optional(Type.Number()),
        })
      },
      handler: ({ query }) => ({
        users: [{ id: '1', name: 'John' }],
        total: 100,
        page: query.page,
      })
    }),

    defineRoute({
      method: 'POST',
      path: '/users',
      schema: {
        body: Type.Object({
          name: Type.String(),
          email: Type.String(),
        })
      },
      handler: ({ body }) => ({
        id: '123',
        name: body.name,
        email: body.email,
      })
    }),

    defineRoute({
      method: 'GET',
      path: '/users/:id',
      schema: {
        params: Type.Object({
          id: Type.String(),
        })
      },
      handler: ({ params }) => ({
        id: params.id,
        name: 'John Doe',
        email: 'john@example.com',
      })
    }),

    defineRoute({
      method: 'DELETE',
      path: '/users/:id',
      handler: () => ({ success: true })
    }),

    defineRoute({
      method: 'PUT',
      path: '/posts/:id',
      schema: {
        body: Type.Object({
          title: Type.String(),
          content: Type.String(),
        })
      },
      handler: ({ body }) => ({
        id: '1',
        title: body.title,
        content: body.content,
      })
    })
  ] as const

  type Api = InferEden<typeof routeDefinitions>

  it('应该推断 GET 请求的返回类型', () => {
    type UsersGetReturn = Api['users']['get']['return']
    
    expectTypeOf<UsersGetReturn>().toMatchTypeOf<{
      users: { id: string; name: string }[]
      total: number
      page: number
    }>()
  })

  it('应该推断 GET 请求的 query 类型', () => {
    type UsersQuery = Api['users']['get']['query']
    
    expectTypeOf<UsersQuery>().toMatchTypeOf<{
      page: number
      limit?: number
    }>()
  })

  it('应该推断 POST 请求的 body 类型', () => {
    type UsersBody = Api['users']['post']['body']
    
    expectTypeOf<UsersBody>().toMatchTypeOf<{
      name: string
      email: string
    }>()
  })

  it('应该推断 POST 请求的返回类型', () => {
    type UsersPostReturn = Api['users']['post']['return']
    
    expectTypeOf<UsersPostReturn>().toMatchTypeOf<{
      id: string
      name: string
      email: string
    }>()
  })

  it('应该推断动态路由参数', () => {
    // /users/:id 生成 { users: { ':id': { get: ... } } }
    type UserIdGet = Api['users'][':id']['get']
    
    expectTypeOf<UserIdGet['return']>().toMatchTypeOf<{
      id: string
      name: string
      email: string
    }>()
  })

  it('应该推断 DELETE 方法', () => {
    type UserIdDelete = Api['users'][':id']['delete']
    
    expectTypeOf<UserIdDelete['return']>().toMatchTypeOf<{
      success: boolean
    }>()
  })

  it('应该正确处理另一个资源路径', () => {
    type PostsPut = Api['posts'][':id']['put']
    
    expectTypeOf<PostsPut['body']>().toMatchTypeOf<{
      title: string
      content: string
    }>()
    
    expectTypeOf<PostsPut['return']>().toMatchTypeOf<{
      id: string
      title: string
      content: string
    }>()
  })
})

describe('EdenClient 运行时类型', () => {
  // 手动定义的契约（用于非 vafast API）
  interface TestContract {
    users: {
      get: { query: { page: number }; return: { id: string }[] }
      post: { body: { name: string }; return: { id: string } }
      ':id': {
        get: { return: { id: string; name: string } }
        delete: { return: { success: boolean } }
      }
    }
  }

  it('应该创建正确类型的客户端', () => {
    const api = eden<TestContract>('http://localhost:3000')
    
    // 验证方法存在
    expectTypeOf(api.users.get).toBeFunction()
    expectTypeOf(api.users.post).toBeFunction()
    
    // 验证参数化路由
    const userById = api.users({ id: '123' })
    expectTypeOf(userById.get).toBeFunction()
    expectTypeOf(userById.delete).toBeFunction()
  })
})
