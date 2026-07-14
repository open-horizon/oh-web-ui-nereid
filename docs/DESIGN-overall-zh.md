# NereidAI 整体设计文档

> 最后更新：2026-07-11

---

## 1. 项目概述

NereidAI 是一个 BFF（Backend-For-Frontend）代理控制台，为 Open Horizon Exchange REST API 提供图形化管理界面。

**核心目标：**

- 为 Open Horizon 边缘计算平台提供友好的 Web 管理界面
- 作为 BFF 层代理所有 Exchange 调用，托管认证、审计、签名
- 为第三方系统提供受控的、只读的 Partner API
- 全量审计日志，满足合规要求

---

## 2. 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 前端框架 | React | 19 |
| 语言 | TypeScript | 7 |
| 构建工具 | Vite | 5 |
| UI 组件库 | Ant Design | 6 |
| 路由 | react-router-dom | 7 |
| 后端框架 | Express.js | 5 |
| 运行环境 | Node.js | 20+ |
| 数据库 | PostgreSQL | 16 |
| 缓存（可选） | Redis | 6.2 |
| 反向代理 | nginx |  |
| 容器化 | Docker / docker-compose |  |

---

## 3. 架构概览

```
[浏览器 SPA] -- HTTPS --> [nginx] -- /api --> [Express BFF] --> [Open Horizon Exchange]
                                                          |
                                                     [PostgreSQL]
                                                          |
                                                     [Redis (可选)]
```

**分层说明：**

- **前端（SPA）**：React + Ant Design + TypeScript，通过 Vite 构建，运行在浏览器中
- **反向代理（nginx）**：TLS 终止、静态资源服务、API 代理、安全头
- **BFF 后端（Express.js 5）**：所有业务逻辑——认证、会话管理、Exchange 代理、服务部署签名、审计
- **数据库（PostgreSQL）**：必须组件，存储 BFF 用户、API 密钥、Exchange 配置、审计日志
- **Redis（可选）**：加密会话持久化，不可用时降级为内存存储，不影响功能

---

## 4. 模块分解

### 4.1 后端模块（server/）

| 文件 | 职责 | 行数 |
|---|---|---|
| `server/index.cjs` | Express 应用入口：中间件、路由、认证、Exchange 代理、签名 | ~2053 |
| `server/db.cjs` | PG 连接池、建表（5 张）、CRUD 辅助函数 | 268 |
| `server/sign-utils.cjs` | RSA-PSS SHA-256 密钥生成与服务部署签名 | 46 |

**后端中间件链（按顺序）：**

1. 请求计时 + 审计日志包装（`res.end` 拦截）
2. 健康检查端点（公开）
3. 全局守卫（会话 / API Key 检查）
4. CSRF 校验（变更操作）
5. 具体路由

### 4.2 前端模块（src/）

| 类别 | 文件 | 职责 |
|---|---|---|
| 入口 | `main.tsx` | React 19 挂载点 |
| 根组件 | `App.tsx` | 路由、RequireAuth、SessionBootstrap |
| 布局 | `components/AppLayout.tsx` | 侧边栏导航、顶部栏、退出 |
| API 客户端 | `api/client.ts` | 统一 HTTP 请求（GET/POST/PUT/PATCH/DELETE） |
| API 模块 | `api/*.ts`（12 个） | 各资源模块 API 调用 |
| 页面 | `pages/*.tsx`（15 个） | 功能页面 |
| 国际化 | `i18n/context.tsx` + `zh.ts` | 中英文切换 |
| 钩子 | `hooks/usePolling.ts`, `useIsMobile.ts` | 轮询、响应式检测 |

**页面列表：**

| 页面 | 路由 | 描述 |
|---|---|---|
| Dashboard | `/` | 组织状态概览 |
| Services | `/services` | 服务 CRUD + 8 面板部署表单 |
| Patterns | `/patterns` | 部署模式 CRUD |
| Policies | `/policies` | 部署策略 CRUD |
| MgmtPolicies | `/mgmtpolicies` | 管理策略 CRUD |
| Nodes | `/nodes` | 边缘节点管理 |
| Agbots | `/agbots` | 协议机器人管理 |
| Organizations | `/organizations` | 组织管理 |
| Users | `/users` | Exchange 用户管理 |
| HaGroups | `/hagroups` | HA 组管理 |
| Catalog | `/catalog` | 公共目录浏览 |
| AgentFileVersion | `/agentfileversion` | Agent 文件版本 |
| AuditLog | `/audit` | 审计日志查看 |
| Login | `/login` | 登录 / 初始化设置 |
| Help | `/help` | 帮助文档 |

---

## 5. 认证与授权模型

### 5.1 双层认证

| 层 | 身份 | 用途 | 存储 |
|---|---|---|---|
| BFF 本地账号 | 控制台用户（platform / partner） | 谁能用控制台 UI | `users` 表（PG） |
| 系统级 Exchange 连接 | 一组共享凭据 | BFF 实际调 Exchange 用 | `exchange_config` 表（单例） |
| 三方 Partner API Key | 第三方系统 | 调 BFF Partner API | `api_keys` 表 |

### 5.2 BFF 角色

| 角色 | 能力 |
|---|---|
| **platform** | 跨 org 全功能：管理 BFF 用户、Exchange 配置、所有 API Key、Exchange 资源读写 |
| **partner** | 绑定一个 org，org 内 Exchange 资源完整读写（服务、模式、节点、用户等），自助管理 API Key，不能管理 BFF 用户或 Exchange 配置 |

### 5.3 控制台会话

- Cookie：`nereid_sid`（HttpOnly + SameSite=Strict + 自动检测 Secure）
- CSRF：双提交模式——`nereid_csrf` cookie + `X-Csrf-Token` 请求头
- 双超时：空闲 TTL（`SESSION_TTL`，默认 24h）+ 绝对 TTL（`SESSION_ABS_TTL`，默认 8h）
- Session 加密：AES-256-GCM（`SESSION_ENC_KEY`），持久化到 Redis（可选）

### 5.4 Partner API

- 鉴权：`X-Api-Key` 请求头
- Org 隔离：org 强制取自 Key 绑定，路径 `{org}` 与 Key 不一致返回 403
- 只读：仅允许 GET（变更操作返回 403）
- 白名单：`/services`、`/patterns`、`/business/policies`、`/managementpolicies`、`/nodes`、`/users`、`/hagroups`、`/AgentFileVersion`（含子路径）

### 5.5 API Key

- 格式：`nk_{live|test}_<36 字节 base64url>`
- 存储：数据库仅存 `sha256(明文)`，明文仅创建时返回一次
- 吊销：`revoked = true` 软删除
- 过期：可选 `expires_at` 字段

---

## 6. 数据流

### 6.1 控制台登录

```
用户 -> POST /api/login (username + password)
   -> DB 查用户、scrypt 校验密码
   -> 创建 nereid_sid + nereid_csrf cookie
   -> 返回 session 信息（orgId, role, csrfToken）
```

### 6.2 Exchange 资源操作

```
用户 -> API 请求（cookie + CSRF header）
   -> 全局守卫校验 session
   -> CSRF 中间件校验变更操作
   -> 路由处理器调 exch() 函数
   -> exch() 用共享 Exchange 凭据调实际 Exchange API
   -> 返回结果 + 写审计日志
```

### 6.3 Partner API 调用

```
第三方 -> GET /api/v1/{org}/services (X-Api-Key)
   -> 全局守卫放行（识别 X-Api-Key）
   -> partnerAuth 中间件查找并验证 Key（sha256）
   -> 路由处理器校验 org、白名单、只读
   -> exch() 用共享 Exchange 凭据代理请求
   -> 返回结果 + 写审计日志
```

---

## 7. 数据库 Schema

所有表由 `db.initSchema()` 自动创建，PostgreSQL 驱动。

### 7.1 users（BFF 本地账号）

```sql
CREATE TABLE users (
  username    TEXT PRIMARY KEY,
  hash        TEXT NOT NULL,       -- scrypt hash (64 bytes hex)
  salt        TEXT NOT NULL,       -- random salt (16 bytes hex)
  role        TEXT NOT NULL CHECK (role IN ('platform','partner')),
  org         TEXT,                -- NULL for platform, 必填 for partner
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### 7.2 api_keys（Partner API Key）

```sql
CREATE TABLE api_keys (
  id          UUID PRIMARY KEY,
  key_hash    TEXT NOT NULL UNIQUE, -- sha256(plaintext)
  key_plain   TEXT NOT NULL,        -- 明文存储，仅创建时返回一次，后可通过 GET /api/apikeys/:id/key 查询
  org         TEXT NOT NULL,
  label       TEXT NOT NULL,
  revoked     BOOLEAN DEFAULT false,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  created_by  TEXT
);
```

### 7.3 exchange_config（Exchange 连接配置，单例）

```sql
CREATE TABLE exchange_config (
  id          INTEGER PRIMARY KEY DEFAULT 1,  -- 固定为 1
  base_url    TEXT NOT NULL,
  auth        TEXT NOT NULL,       -- base64(username:password)
  org_id      TEXT NOT NULL,
  version     TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  updated_by  TEXT
);
```

### 7.4 audit_log（审计日志，只追加）

```sql
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ DEFAULT now(),
  actor_type  TEXT NOT NULL,       -- 'user' | 'apikey' | 'system'
  actor       TEXT NOT NULL,       -- 用户名 或 apikey:{label}
  org         TEXT,
  method      TEXT NOT NULL,
  path        TEXT NOT NULL,
  status      INTEGER,
  ip          TEXT,
  ms          INTEGER,
  proxied_to  TEXT,                -- 实际代理的 Exchange 端点
  detail      JSONB
);
```

### 7.5 settings（系统设置，键值对）

```sql
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

存储运行时参数如 `session_ttl`、`session_abs_ttl`、`audit_retention_days`，通过 `GET/PUT /api/settings` 读写。

---

## 8. 安全设计

| 项目 | 方案 |
|---|---|
| 密码存储 | `crypto.scryptSync` + 16 字节随机盐，`timingSafeEqual` 比较 |
| Session Cookie | HttpOnly + SameSite=Strict + 自动 Secure（HTTPS 检测） |
| CSRF | 双提交模式：nereid_csrf cookie + X-Csrf-Token header |
| API Key 存储 | 仅存 `sha256(明文)`，明文不落库 |
| Session 加密 | AES-256-GCM（`SESSION_ENC_KEY`）用于 Redis 持久化 |
| 会话超时 | 空闲 24h + 绝对 8h |
| Partner API | 只读（仅 GET）+ org 强制隔离 + 端点白名单 |
| 审计 | 只追加、不可改、含实际代理端点 |
| 请求体过滤 | 白名单模式（`serviceBody`、`patternBody`、`sanitizeBody`） |
| 部署签名 | RSA-PSS SHA-256，服务创建/更新时自动签名 |

---

## 9. 服务部署签名

Open Horizon 要求服务 `deployment` 字段附带 RSA-PSS SHA-256 签名。

- 密钥对生成：`server/sign-utils.cjs` — 2048 位 RSA，PKCS#1 私钥 / SPKI 公钥
- 自动签名：服务创建（POST）或更新（PUT）时，若 `deployment` 存在则自动签名
- 公钥上传：每次签名后自动上传到 Exchange（`/orgs/{org}/services/{id}/keys/{id}.public.pem`）

---

## 10. 审计系统

- 范围：所有 `/api` 请求（控制台 + Partner API）均记录
- 存储：`audit_log` 表，只追加（应用代码无 UPDATE/DELETE）
- 内容：actor、org、method、path、status、IP、响应时间 ms、实际代理端点、请求正文摘要
- 查询：按时间倒序，平台可查看全部，partner 仅见自己 org
- 保留：无限制（可通过 `audit_retention_days` 设置，0=永久，>0 则每小时清理过期条目）

---

## 11. UI/UX 设计

### 11.1 登录 / 初始化

- 单个路由 `/login`，自动检测 `/api/setup-status`：
  - `needsSetup=true`：显示 **Setup 表单**（创建 admin 账号 + 配置 Exchange 连接）
  - `needsSetup=false`：显示 **Login 表单**（BFF 用户登录）
- Setup 表单：上下两区，一次提交——上半区账号信息（用户名、密码）、下半区 Exchange 连接（URL、账号、密码）
- Setup 成功后：自动登录，跳转 Dashboard
- Login 成功后：跳转 Dashboard
- Login 成功后后端返回 `csrfToken`，前端存入 `api/config.ts` 供后续写操作使用

### 11.2 角色与菜单

| 角色 | 菜单可见性 |
|---|---|
| **platform** | 全部菜单 |
| **partner** | 除「用户管理（BFF）」和「设置（Exchange 配置）」外全部可见 |

所有页面根据角色做门控：
- partner 页面功能完整（可增删改查），但 org 强制锁定
- platform 可跨 org 操作

### 11.3 Dashboard

```
┌─────────────────────────────────────────────┐
│  platform 专属：汇总卡片（全 org 合计）        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│  │ 节点  │ │ 服务  │ │ 模式  │ │ Agbot│       │
│  │ 总数  │ │ 总数  │ │ 总数  │ │ 总数  │       │
│  └──────┘ └──────┘ └──────┘ └──────┘       │
│  platform 跨 org 汇总；partner 仅显示本 org   │
└─────────────────────────────────────────────┘
```

- partner：仅显示本 org 统计（无切换）
- platform：显示跨 org 汇总统计

### 11.4 Org 切换

- 平台用户在 **资源页面**（节点、服务、模式、策略）顶部搜索栏左侧放置 org 下拉选择器
- 选中后仅当前页面生效，通过 `?org=` 参数传给后端
- partner 用户无 org 切换，始终限定在自己绑定的 org

### 11.5 API Key 管理

- **platform**：通过 `/api/apikeys` 管理所有 org 的 Key（创建 / 查看 / 删除）
- **partner**：在「我的 API Key」页面通过 `/api/my-apikeys` 自助管理本 org 的 Key
- 创建时显示一次明文 Key，之后不再可查
- 列表显示 label、状态（正常/已吊销）、过期时间

### 11.6 审计日志

- `/audit` 页面，列表展示（时间倒序）
- 每条可点开抽屉查看详情（proxied_to、detail JSON 等）
- platform 可看全部 org，可通过 org 下拉筛选
- partner 只看自己 org

### 11.7 设置页面（platform 专属）

左侧菜单两个标签页：

**连接配置** — Exchange 配置：查看 / 修改连接参数（URL、账号、密码）。修改后立即生效。

**会话审计** — 运行时参数，持久化到 PG：
- **会话空闲超时**：默认 86400s (24h)
- **会话绝对超时**：默认 28800s (8h)
- **审计保留天数**：默认 0（不限）

通过 `GET/PUT /api/settings` 接口读写。

### 11.8 边缘节点 — 用户输入管理

在节点详情抽屉中新增 **User Input** 标签页，用于管理 edge 服务容器的环境变量（userInput）。

- 首次打开抽屉时加载 Exchange 可用服务列表，供选择
- 每个服务条目标题使用 `<Select>` 从已知服务中选择，自动填充 `serviceOrgid`、`serviceUrl`、`serviceArch`
- `inputs` 以 key:value 行展示，支持增删改
- 支持添加多个服务条目，每个条目可独立配置变量
- **Save** 按钮调用 `PATCH /api/nodes/{id}` 仅更新 `userInput` 字段，不影响节点其他属性（pattern、registeredServices 等）
- 底层通过 BFF 代理 `PATCH /orgs/{org}/nodes/{nodeId}` 到 Exchange API，实现原地部分更新

前端 API：`NodeAPI.updateUserInput(nodeId, userInput, org?)` → `src/api/nodes.ts`。

## 12. 部署

### 12.1 docker-compose

```yaml
services:
  postgres:      # PostgreSQL 16-alpine，必需
  redis:         # Redis 6.2-alpine，可选（降级内存）
  backend:       # Express BFF（node:20-alpine）
  frontend:      # nginx + 静态资源 + TLS
```

### 12.2 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|---|---|---|---|
| `DATABASE_URL` | 是 | — | PostgreSQL 连接串 |
| `PORT` | 否 | 3001 | 后端监听端口 |
| `SESSION_TTL` | 否 | 86400 | 会话空闲超时（秒）|
| `SESSION_ABS_TTL` | 否 | 28800 | 会话绝对超时（秒）|
| `SESSION_ENC_KEY` | 否 | 自动生成 | AES-256-GCM 密钥（64 hex）|
| `REDIS_URL` | 否 | — | Redis 连接串（可选）|
| `NODE_ENV` | 否 | development | production 启用 API Key live 前缀 |

---

## 13. 代码结构

```
NereidOpenHorizon/
├── server/
│   ├── index.cjs           # Express 应用入口
│   ├── db.cjs              # PostgreSQL 数据层
│   └── sign-utils.cjs      # RSA-PSS 签名工具
├── src/
│   ├── main.tsx            # React 入口
│   ├── App.tsx             # 路由 + 会话引导
│   ├── api/                # API 客户端模块
│   ├── pages/              # 15 个功能页面
│   ├── components/         # 通用组件
│   ├── hooks/              # 自定义钩子
│   └── i18n/               # 国际化（zh/en）
├── docs/
│   ├── DESIGN-overall-zh.md        # 本文（中文整体设计）
│   ├── DESIGN-overall-en.md        # 整体设计（英文）
│   ├── DESIGN-auth-multitenancy.md # 认证与多租户设计（中文）
│   ├── openapi-console.yaml        # 控制台 API 规范
│   ├── openapi-partner.yaml        # Partner API 规范
│   ├── openapi.yaml.deprecated     # 旧版规范（已废弃）
│   └── PRODUCTION.md               # 生产部署指南
├── docker-compose.yaml   # 容器编排
├── Dockerfile             # 构建镜像
├── nginx.conf             # nginx 配置
└── vite.config.ts         # Vite 配置
```
