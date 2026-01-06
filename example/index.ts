/**
 * @vafast/api-client 使用示例
 * 
 * Eden 风格 - 最自然的 API 调用
 */

import { eden } from '../src'

// 定义 API 契约
interface ApiContract {
  users: {
    get: { query: { page?: number }; return: { id: string; name: string }[] }
    post: { body: { name: string; email: string }; return: { id: string } }
    ':id': {
      get: { return: { id: string; name: string } }
      put: { body: { name?: string }; return: { id: string; name: string } }
      delete: { return: { success: boolean } }
    }
  }
}

// 创建客户端
const api = eden<ApiContract>('https://api.example.com', {
  headers: { 'Authorization': 'Bearer token' }
})

// 使用
async function main() {
  // GET /users?page=1
  const users = await api.users.get({ page: 1 })
  console.log(users.data)

  // POST /users
  const newUser = await api.users.post({ name: 'John', email: 'john@test.com' })
  console.log(newUser.data)

  // GET /users/123
  const user = await api.users({ id: '123' }).get()
  console.log(user.data)

  // DELETE /users/123
  const deleted = await api.users({ id: '123' }).delete()
  console.log(deleted.data)
}

main()

export { api }
