# TODO: 类型同步功能

## 背景

前后端分离项目中，共享类型需要发布 npm 包，流程繁琐且需要私有 npm 服务。

## 目标

实现一条命令同步 API 类型，无需 npm 发包。

## 方案设计

### 1. 服务端：暴露类型端点

```typescript
// vafast 自动注册端点
// GET /__vafast__/types

import { serve } from 'vafast'

serve({
  routes,
  exposeTypes: true  // 开启类型导出端点
})
```

返回内容：
```typescript
// 自动生成的类型定义
export const routes = [...] as const
export type AppRoutes = typeof routes
```

### 2. 客户端 CLI

```bash
# 安装
npm install -D @vafast/cli

# 同步类型
npx vafast sync --url http://localhost:3000

# 或指定输出路径
npx vafast sync --url http://localhost:3000 --out src/api.d.ts
```

### 3. 自动化（可选）

```json
// package.json
{
  "scripts": {
    "dev": "vafast sync --url $API_URL && vite",
    "build": "vafast sync --url $API_URL && vite build"
  }
}
```

## 实现步骤

- [ ] vafast 核心：添加 `exposeTypes` 选项
- [ ] vafast 核心：实现 `/__vafast__/types` 端点
- [ ] vafast 核心：实现类型序列化（保留字面量类型）
- [ ] @vafast/cli：创建 CLI 包
- [ ] @vafast/cli：实现 `sync` 命令
- [ ] @vafast/cli：支持配置文件 `.vafastrc`

## 技术难点

1. **类型序列化**：如何将运行时的路由定义导出为 TypeScript 类型字符串
2. **TypeBox Schema 转换**：将 TypeBox schema 转为 TypeScript 类型
3. **字面量保留**：确保 `'GET'`、`'/users'` 等字面量类型不被扩展

## 参考

- tRPC：需要 monorepo 或 npm 包共享类型
- Elysia Eden：同样需要共享代码
- OpenAPI Generator：从 JSON Schema 生成类型（可参考）

## 优先级

中等 - 当前可用方案（npm link / monorepo）能满足需求，此功能为优化体验。

