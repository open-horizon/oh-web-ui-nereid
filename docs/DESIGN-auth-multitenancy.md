# NereidAI 控制台 — 认证与多租户设计文档

> 状态：已全部完成
> 适用范围：NereidAI BFF（Exchange UI 代理控制台）
> 最后更新：2026-07-11

---

## 1. 背景与目标

NereidAI 是一个 BFF（Backend-For-Frontend）代理，前端控制台通过它调用 Open Horizon Exchange API。
本期目标：

- 控制台拥有**自己的用户认证体系**（不再每次登录都填 Exchange 凭据）。
- Exchange 连接配置**系统级、设一次、持久化**，除非管理员修改否则不变。
- 支持 Exchange **多组织（多租户）**管理。
- **开放给第三方**：第三方系统通过 API Key 对接，仅能管理**自己的 org**，能力等同 `org/admin`。
- **严格审计**：所有调用（控制台用户 + 第三方 API Key）全量记录，只追加、不可改。
- 存储统一使用 **PostgreSQL**（开发/生产一致，缺失即报错退出）。

设计依据：Open Horizon 官方文档（https://open-horizon.github.io/ ）中的认证与 RBAC 模型。

---

## 2. 总体架构：两层认证

系统内存在**两层**身份，必须区分清楚：

| 层 | 身份 | 用途 | 存储 |
|----|------|------|------|
| BFF 本地账号 | 控制台用户（admin/operator/viewer） | 谁能用控制台 UI | `users` 表 |
| 系统级 Exchange 连接 | 一套共享凭据（`org/user:pass` 或 root/hub-admin） | BFF 实际调 Exchange 用 | `exchange_config` 表（单例） |
| 三方 Partner API Key | 第三方系统持有的密钥，绑定到某个 org | 第三方调我们的 Partner API | `api_keys` 表 |

**调用链（第三方）：**
```
第三方系统 --(X-Api-Key: 我们的key)--> NereidAI BFF
        BFF 校验 key、锁定 org、写审计
        --(共享 root/hub-admin 凭据)--> Open Horizon Exchange
```
第三方**从不直接碰 Exchange**，全部过 BFF 这一层，从而具备 org 隔离 + 全量审计 + 限流能力。

> **重要区分**：Open Horizon Exchange **自带** API Key（user keys / service keys / agbot keys / node tokens），是节点、agbot、服务**直接调 Exchange** 用的。
> 本文档设计的 API Key 是 **NereidAI 控制台自己签发**的，给第三方调**我们的 Partner API** 用。二者不是一回事。

---

## 3. 多租户模型：模型 X（已选定）

- BFF 配置**一套共享的强账号**（推荐 **hub-admin**，最小权限仍能跨 org 代理；非必要不用 root）。
- 控制台 UI 提供「**当前组织**」切换器（`pageOrg`），在已有权限的多个 org 间切换。
- 所有 BFF 用户**共用同一套 Exchange 身份**，但各自 BFF 角色不同（admin/operator/viewer）。
- 现有路由层已支持 `req.query.org || s.orgId` 覆盖与 `orgType==='system'` 逻辑，组织切换能力复用。

**不支持**：按用户隔离 org（即用户 A 只能看 org1、用户 B 只能看 org2 且各自带独立 Exchange 身份）。
如需该能力需改为「每用户独立 Exchange 凭据」，与「设一次」目标冲突，本期不做。

---

## 4. 本地用户与角色

账号存于 `users` 表，密码用 `crypto.scryptSync` 加盐哈希（salt 16 字节，hash 64 字节），**绝不存明文**。
`users` 表含 `org` 列：platform 账号为 NULL（跨 org），partner 账号绑定一个 org。

| 角色 | 身份 | 控制台能力 | 能否管用户/配置 | API Key 管理 |
|------|------|-----------|----------------|-------------|
| **platform（平台管理员）** | 内部 | 跨 org 全功能 | 能（管所有 BFF 用户 + 改 Exchange 配置） | 能管所有 org 的 Key |
| **partner（组织管理员）** | 开给第三方或下级组织、绑定一个 org | 本 org 内**完整读写**（org 隔离，不能跨 org） | 不能 | 仅能自助建/吊销**本 org** 的 Key |

要点：
- 内部角色**不叫 admin**（避免与 Exchange org/admin 混淆），命名为 `platform`。
- partner 是「绑定 org 的组织管理员」：在绑定 org 内拥有完整读写权限（服务、模式、节点、用户等），但无法跨 org、无法管理 BFF 账号和 Exchange 配置。
- **API Key 自助**：partner 自己申请/吊销本 org 的 Key；platform 可管全部。
- platform 可以跨 org 操作；partner 的 org 被强制锁定，操作始终限制在绑定 org 内。

---

## 5. 系统级 Exchange 连接配置（单例）

- 存于 `exchange_config` 表（id 固定为 1）。
- 字段：`base_url`、`auth`（base64 `user:pass`）、`org_id`、`version`、`updated_at`、`updated_by`。
- **首次启动**无本地用户时进入「初始化设置页」：一步创建 admin 账号 + 配置 Exchange 连接。
- 之后仅 **admin** 可在「设置」页修改（`PUT /api/exchange-config`，后端先校验凭据再保存）。
- 修改后立即 `propagateExchangeConfig()` 推送到所有在线会话，无需重新登录。

---

## 6. 三方 Partner API

### 6.1 设计原则（已确认）

- 鉴权用 **API Key**（`X-Api-Key` 请求头），**不走 cookie**（HTTPS 暴露，安全性可控）。
- **长有效期**（默认 365 天，可配置），靠**可吊销**管理生命周期。
- org **强制取自 Key 绑定值**：请求里的 `?org=`、header 等覆盖一律丢弃，越界返回 403。
- 端点路径**锁定 org**：`/api/v1/{org}/...`，与控制台端点物理隔离。
- 能力范围 = 其 org 内**全部 `org/admin` 功能**，仅排除 org 之外的事：
  - 建/删 org（跨组织管理）
  - Exchange 连接配置
  - BFF 用户管理
  - 跨 org 访问

### 6.2 暴露的端点（org 内全量）

服务 / 模式 / 部署策略(business policies) / 管理策略(management policies) / 节点(+policy/agreements/status/errors/managementStatus) / 本 org 用户 / HA 组 / AgentFileVersion / 服务的 keys 与 dockauths / 组织状态。

### 6.3 API Key 生成算法（已确认安全做法）

- 格式：`nk_<env>_<48位随机>`，其中 `<env>` 为 `live`（生产）或 `test`（其他）。
- 随机部分：`crypto.randomBytes(36).toString('base64url')`（约 48 字符，URL 安全）。
- **数据库只存 `sha256(plaintext)` 摘要**，明文仅在创建时返回一次。
- 表字段：`id`(UUID)、`key_hash`(唯一索引)、`org`、`label`、`revoked`、`expires_at`、`created_at`、`created_by`。
- 吊销：`revoked=true`（软删，保留审计）；亦可硬删。

---

## 7. 审计（严格、全量、只追加）

- `audit_log` 表：**应用代码绝不做 UPDATE/DELETE**，仅 INSERT（只追加、防篡改）。
- **全量记录**：控制台用户调用 + 第三方 API Key 调用，一律入库。
- 每条记录字段：
  - `ts`、`actor_type`（`user`/`apikey`/`system`）、`actor`（用户名 或 apikey id+label）
  - `org`、`method`、`path`、`status`、`ip`、`ms`
  - `proxied_to`：**实际代理到的 Exchange 端点**（便于追溯三方到底干了啥）
  - `detail`：完整 JSON（请求摘要、错误信息等）
- 保留策略：不限时长（可通过 `audit_retention_days` 运行时参数配置，0=永久，>0 则每小时清理）
- UI：`审计日志`页列表显示摘要；点「查看详细」抽屉展示**全部字段**（含 `proxied_to`、`detail`）。

---

## 8. 控制台会话硬化（已确认，不做 OIDC）

本地账号登录，会话强化：

- Cookie：`HttpOnly` + `Secure`（仅 HTTPS 时）+ `SameSite=Strict` + `Path=/` + `Max-Age`。
- **CSRF Token**：双提交模式——登录时下发 `nereid_csrf` Cookie + 返回 token，前端写操作带 `X-Csrf-Token`，后端校验。
- **双超时**：空闲超时 `SESSION_TTL`（默认 86400s=24h） + 绝对超时 `SESSION_ABS_TTL`（默认 28800s=8h），绝对超时到点强制重新登录。
- **会话轮换**：定期/提权时轮换 `nereid_sid`。
- 凭据加密：`SESSION_ENC_KEY`（32 字节 hex）AES-256-GCM，持久化到 Redis（不可用时降级内存）。

---

## 9. 存储：PostgreSQL

- 依赖：`pg`。`DATABASE_URL` 必填，缺失即 `process.exit(1)`（开发/生产一致）。
- 启动 `initSchema()` 自动建表（带重试，连不上重试 10 次后退出）。
- 表：`users`、`api_keys`、`exchange_config`、`audit_log`、`settings`（见 `server/db.cjs`）。
- `docker-compose.yaml` 已加 `postgres:16-alpine` 服务，挂载 `postgres-data` 卷，后端 `depends_on` 其 healthy。

---

## 10. OpenAPI（方案 B：两份文件，已确认）

- `docs/openapi-console.yaml`：控制台 API（cookie/Session 鉴权，BFF 角色）。
- `docs/openapi-partner.yaml`：**单独发给第三方**，仅含窄化、路径锁定 org 的 Partner 端点，明确标注「org 隔离、仅 org/admin 能力」，安全方案为 `ApiKeyAuth`（`X-Api-Key`）。

---

## 11. 实现状态（TODO）

- [x] 设计文档（本文）
- [x] `package.json` 加 `pg`；`docker-compose.yaml` 加 postgres
- [x] `server/db.cjs`（PG 连接 + 建表 + CRUD）
- [x] `server/index.cjs` 改造：文件存储 → PG；setup 写 PG；CSRF / 绝对超时 / 会话硬化
- [x] API Key 鉴权 + Partner API（`/api/v1/:org/...`）+ org 隔离 + read-only 强制
- [x] 全量审计中间件（只追加、含 proxied_to）
- [x] 控制台会话硬化（CSRF double-submit、绝对超时、安全 Cookie）
- [x] 本地用户 CRUD（platform / partner 角色）、Exchange 配置管理
- [x] Partner 自助 API Key（/api/my-apikeys）& 平台管理（/api/apikeys）
- [x] 前端：初始化/登录（setup vs login + CSRF）、设置页（连接配置 + 会话审计两个 tab）、审计详情抽屉、角色门控菜单、CSRF 头集成、平台 org 切换器
- [x] `/api/audit` 改读 `audit_log` 表（平台看全部、合作方只看本 org）+ 搜索 + org 过滤
- [x] agbot 路由限定平台（合作方不可跨 org 看/绑 IBM agbot）
- [x] Redis 改为真正可选（仅 `REDIS_URL` 设置时连接，否则静默降级内存）
- [x] 审计保留定时清理（按 `audit_retention_days`，0=永久）
- [x] OpenAPI 拆两份（console + partner）

---

## 12. 安全要点速查

1. 第三方只认 `X-Api-Key`，org 永远取自 Key，忽略一切覆盖 → 防越权。
2. API Key 明文不落库，只存 sha256；吊销靠 `revoked` 标志。
3. 审计全量、只追加、含实际代理端点，满足追溯与合规。
4. 控制台会话硬化：安全 Cookie + CSRF + 双超时 + 轮换。
5. BFF API Key ≠ Open Horizon Exchange Key，勿混淆。
