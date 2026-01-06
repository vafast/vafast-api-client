/**
 * Eden 风格 API 客户端示例
 * 
 * 最自然的链式调用！
 */

import { eden } from '../src'

// ============= 契约定义 =============

interface User {
  id: string
  name: string
  email: string
}

interface Post {
  id: string
  title: string
  content: string
}

// Eden 风格契约
interface ApiContract {
  users: {
    // GET /users
    get: { query: { page?: number; limit?: number }; return: { users: User[]; total: number } }
    // POST /users
    post: { body: { name: string; email: string }; return: User }
    // 动态参数 /users/:id
    ':id': {
      get: { return: User | null }
      put: { body: Partial<User>; return: User }
      delete: { return: { success: boolean } }
      // 嵌套：/users/:id/posts
      posts: {
        get: { query: { page?: number }; return: Post[] }
      }
    }
  }
  posts: {
    get: { return: Post[] }
    post: { body: { title: string; content: string }; return: Post }
    ':id': {
      get: { return: Post }
      // /posts/:id/comments
      comments: {
        get: { return: { id: string; content: string }[] }
        post: { body: { content: string }; return: { id: string; content: string } }
      }
    }
  }
}

// ============= 创建客户端 =============

const api = eden<ApiContract>('http://localhost:3000', {
  headers: { 'Authorization': 'Bearer xxx' }
})

// ============= 使用示例 =============

async function main() {
  // GET /users?page=1&limit=10
  const users = await api.users.get({ page: 1, limit: 10 })
  console.log('用户列表:', users.data?.users)

  // POST /users
  const newUser = await api.users.post({ name: 'John', email: 'john@test.com' })
  console.log('新用户:', newUser.data?.id)

  // GET /users/123
  const user = await api.users({ id: '123' }).get()
  console.log('用户详情:', user.data?.name)

  // PUT /users/123
  const updated = await api.users({ id: '123' }).put({ name: 'Jane' })
  console.log('更新后:', updated.data)

  // DELETE /users/123
  const deleted = await api.users({ id: '123' }).delete()
  console.log('删除成功:', deleted.data?.success)

  // GET /users/123/posts?page=1
  const userPosts = await api.users({ id: '123' }).posts.get({ page: 1 })
  console.log('用户文章:', userPosts.data)

  // POST /posts/456/comments
  const comment = await api.posts({ id: '456' }).comments.post({ content: 'Great!' })
  console.log('新评论:', comment.data)
}

main()

