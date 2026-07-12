# EdgeX 3.1 部署方案（Open Horizon / Nereid 控制台）

本文给出在 Nereid 控制台中，通过 **「依赖服务（Required Services）」+ Business Policy（部署策略）** 部署完整 EdgeX 3.1 技术栈的可照搬步骤。要点：**一个 Business Policy 只能绑定一个服务**，所以 device 与 app 各建一个策略（共 N 个策略），全部绑到同一节点；core/redis 通过各服务的 `requiredServices` 被 agent 自动递归拉取并去重。

适用版本：EdgeX 3.1（消息总线默认 Redis，已移除 Consul，配置/密钥由 `core-common-config-bootstrapper` + `core-keeper` 接管；本文采用“安全关闭”简化模式跳过它们）。

---

## 1. 关键设计决策

### 1.1 为什么用 host 网络
EdgeX 各服务之间靠**服务名**互相发现（`redis`、`core-data` …）。Open Horizon 给每个容器起的名字不是这些，容器间 DNS 解析不到。最稳的做法是**所有服务统一用 host 网络**（`network: "host"`），并让 EdgeX 的 host 走 `127.0.0.1`，discovery 用本机回环即可，无需纠结容器 DNS。

### 1.2 为什么用「依赖服务」而不是一个大 composite
每个 EdgeX 组件建成**独立的服务定义**，用 `requiredServices` 串成依赖链。优点：可单独升级/回滚某个组件、可复用 core 层给多个 device/app。代价是 agent 只保证**启动顺序**，不保证 core 完全就绪（见第 6 节坑位）。

### 1.3 依赖拓扑
```
redis
 ├─ core-metadata
 │    ├─ core-data
 │    │    ├─ core-command
 │    │    └─ app-service-http-export
 │    └─ device-virtual
```
（device-virtual 同时依赖 core-data、core-metadata、core-command、redis）

### 1.4 Business Policy 只声明“业务层”，且一个策略一个服务
`device-virtual` 和 `app-service-http-export` **各自建一个策略**（一个策略只能绑定一个服务）；`redis` / `core-*` 通过各服务定义的 `requiredServices` 被 agent **递归自动拉取并去重**，无需写进策略。

---

## 2. 服务定义总览

| # | Service URL | 镜像 | 依赖服务（requiredServices） |
|---|-------------|------|------------------------------|
| 1 | `redis` | `redis:7` | 无 |
| 2 | `core-metadata` | `edgexfoundry/core-metadata:3.1.0` | `redis` |
| 3 | `core-data` | `edgexfoundry/core-data:3.1.0` | `redis`, `core-metadata` |
| 4 | `core-command` | `edgexfoundry/core-command:3.1.0` | `redis`, `core-metadata`, `core-data` |
| 5 | `device-virtual` | `edgexfoundry/device-virtual:3.1.0` | `redis`, `core-metadata`, `core-data`, `core-command` |
| 6 | `app-service-http-export` | `edgexfoundry/app-service-http-export:3.1.0` | `redis`, `core-metadata`, `core-data` |

> 控制台「依赖服务」面板里勾选的是服务 key（如 `yiqisoft/core-data`）。保存时控制台会自动转成 Exchange 要求的
> `{ "org": "yiqisoft", "url": "core-data", "version": "3.1.0", "arch": "amd64" }` 格式（`url` 必须是对方服务定义的 **Service URL 字段**，不是 key）。

公共环境变量（所有 core 服务都要）：
```
EDGEX_SECURITY_SECRET_STORE=false
EDGEX_MESSAGEBUS_TYPE=redis
EDGEX_MESSAGEBUS_HOST=127.0.0.1
EDGEX_MESSAGEBUS_PORT=6379
```

---

## 3. 各服务 Deployment JSON（粘到控制台 JSON tab 即可）

> 通用结构：`{ "services": { "<Service URL>": { ... } } }`。下面每个都是独立服务的完整 deployment。

### 3.1 redis
```json
{
  "services": {
    "redis": {
      "image": "redis:7",
      "network": "host",
      "ports": ["6379:6379"]
    }
  }
}
```

### 3.2 core-metadata
```json
{
  "services": {
    "core-metadata": {
      "image": "edgexfoundry/core-metadata:3.1.0",
      "network": "host",
      "environment": [
        "EDGEX_SECURITY_SECRET_STORE=false",
        "EDGEX_MESSAGEBUS_TYPE=redis",
        "EDGEX_MESSAGEBUS_HOST=127.0.0.1",
        "EDGEX_MESSAGEBUS_PORT=6379"
      ],
      "ports": ["59881:59881"]
    }
  }
}
```

### 3.3 core-data
```json
{
  "services": {
    "core-data": {
      "image": "edgexfoundry/core-data:3.1.0",
      "network": "host",
      "environment": [
        "EDGEX_SECURITY_SECRET_STORE=false",
        "EDGEX_MESSAGEBUS_TYPE=redis",
        "EDGEX_MESSAGEBUS_HOST=127.0.0.1",
        "EDGEX_MESSAGEBUS_PORT=6379"
      ],
      "ports": ["59880:59880"]
    }
  }
}
```

### 3.4 core-command
```json
{
  "services": {
    "core-command": {
      "image": "edgexfoundry/core-command:3.1.0",
      "network": "host",
      "environment": [
        "EDGEX_SECURITY_SECRET_STORE=false",
        "EDGEX_MESSAGEBUS_TYPE=redis",
        "EDGEX_MESSAGEBUS_HOST=127.0.0.1",
        "EDGEX_MESSAGEBUS_PORT=6379"
      ],
      "ports": ["59882:59882"]
    }
  }
}
```

### 3.5 device-virtual
```json
{
  "services": {
    "device-virtual": {
      "image": "edgexfoundry/device-virtual:3.1.0",
      "network": "host",
      "environment": [
        "EDGEX_SECURITY_SECRET_STORE=false",
        "EDGEX_MESSAGEBUS_TYPE=redis",
        "EDGEX_MESSAGEBUS_HOST=127.0.0.1",
        "EDGEX_MESSAGEBUS_PORT=6379",
        "EDGEX_SERVICE__HOST=127.0.0.1"
      ],
      "ports": ["59900:59900"]
    }
  }
}
```

### 3.6 app-service-http-export
```json
{
  "services": {
    "app-service-http-export": {
      "image": "edgexfoundry/app-service-http-export:3.1.0",
      "network": "host",
      "environment": [
        "EDGEX_SECURITY_SECRET_STORE=false",
        "EDGEX_MESSAGEBUS_TYPE=redis",
        "EDGEX_MESSAGEBUS_HOST=127.0.0.1",
        "EDGEX_MESSAGEBUS_PORT=6379",
        "WRITABLE_PIPELINE_HTTPEXPORT_URL=http://127.0.0.1:48080"
      ],
      "ports": ["59700:59700", "48080:48080"]
    }
  }
}
```

> 端口说明（host 网络下其实可省略 `ports`，服务直接绑主机口；写上便于排查）：
> redis 6379 · core-metadata 59881 · core-data 59880 · core-command 59882 · device-virtual 59900 · app-service 59700（服务）/ 48080（导出目标示例）。

---

## 4. 在控制台里建这 6 个服务

对每个服务：
1. 「服务」页 → **Create Service**
2. **Service Name** 填上表 URL（如 `core-data`）
3. **Service URL** 填同样的纯名（**不要**带 `yiqisoft/` 前缀，否则 id 会被污染成 `yiqisoft-core-data_...`）
4. **Version** = `3.1.0`，**Architecture** = 节点 arch（如 `amd64`）
5. 切到 **Deployment JSON** tab，粘入上面对应的 JSON
6. 展开 **Required Services（依赖服务）** 面板，勾选上表「依赖服务」列里的服务
7. 确认 **Organization** 选 `yiqisoft`（平台账号必选）
8. 提交

验证：建完后点开服务详情，Keys / Deployment 正常，且 `requiredServices` 已写入。

---

## 5. Business Policy（部署策略）

> ⚠️ **一个 Business Policy 只能绑定一个服务**（policy 的 `service` 是单个对象，不是数组）。所以要把 device 和 app **都**部署到节点，需要**各建一个策略**，再把两个策略都绑到同一节点。控制台「Policies」页的创建/编辑也只接受单个服务，与 OH 一致。

建两个策略，每个只引用一个业务层服务：

```json
{
  "name": "edgex-3.1-device-virtual",
  "labels": ["edgex"],
  "description": "EdgeX 3.1 device-virtual via policy",
  "service": {
    "org": "yiqisoft",
    "name": "device-virtual",
    "arch": "amd64",
    "version": "[3.1.0,4.0.0)",
    "serviceVersions": [{ "version": "[3.1.0,4.0.0)", "priority": {}, "upgradePolicy": {} }],
    "nodeHealth": { "ping_interval": 60, "parallel_health_check": true }
  },
  "properties": [],
  "constraints": ["arch == amd64"]
}
```

```json
{
  "name": "edgex-3.1-app-service",
  "labels": ["edgex"],
  "description": "EdgeX 3.1 app-service-http-export via policy",
  "service": {
    "org": "yiqisoft",
    "name": "app-service-http-export",
    "arch": "amd64",
    "version": "[3.1.0,4.0.0)",
    "serviceVersions": [{ "version": "[3.1.0,4.0.0)", "priority": {}, "upgradePolicy": {} }],
    "nodeHealth": { "ping_interval": 60, "parallel_health_check": true }
  },
  "properties": [],
  "constraints": ["arch == amd64"]
}
```

- `constraints` 必须能被节点属性满足（节点注册时带 `arch=amd64`）。
- 想给服务传额外环境变量，在策略的 `userInput` 里配（控制台策略页对应项，或 Exchange API 的 `userInput` 数组）。
- `redis` / `core-*` **不写进策略**——它们是 device/app 服务定义里的 `requiredServices`，agent 解析两个策略时各自递归拉取，并对 `redis`/`core-*` 做**去重合并**（每个只部署一次）。

---

## 6. 节点注册与下发

1. 边缘节点安装 Open Horizon agent（`hzn`/agent 安装脚本），注册到 Exchange，属性带 `arch=amd64`。
2. 把上面**两个策略都分配给节点**（控制台节点管理，或 `hzn policy` / Exchange API）。节点会与每个策略各建立一个 agreement，因此 device-virtual 和 app-service 都会被下发。
3. agent 分别拉取两个策略 → 各自解析出 `device-virtual` / `app-service-http-export` → 递归拉取 `requiredServices` → 去重合并后按拓扑顺序启动：

   ```
   redis → core-metadata → core-data → core-command → device-virtual / app-service-http-export
   ```

---

## 7. 必踩坑位

1. **无健康门控**：agent 只保证启动**顺序**，不保证 core 完全就绪后再起 device/app。EdgeX 的 device/app 自带重连重试通常能扛；若不稳，在镜像启动脚本里加 `sleep` 或 `wait-for` 逻辑（等 redis / core 端口可连）。
2. **host 网络端口冲突**：所有服务绑主机口，确认不冲突（见第 3 节端口表）。同一节点不要重复部署同端口服务。
3. **安全开关一致性**：所有服务都必须 `EDGEX_SECURITY_SECRET_STORE=false`。有的起 secretstore、有的不起会互相等不到而卡住。
4. **镜像小版本对齐**：6 个服务尽量用同一小版本（如全 `3.1.0`），避免 EdgeX 内部协议/API 不兼容。
5. **arch 对齐节点**：服务定义 arch 必须与目标节点一致（amd64 / arm64），否则 pattern/policy 匹配不到节点。
6. **requiredServices 必须带 org**：控制台已自动补 `org` 字段；若手工改 JSON 漏掉 `org`，Exchange 会报 502 `OrgAndId.org() is null`。
7. **Service URL 别带 org 前缀**：否则创建出的服务 id 会被污染（`yiqisoft-xxx_...`）。

---

## 8. 验证清单

- [ ] 6 个服务定义均创建成功，`requiredServices` 正确
- [ ] Business Policy 创建成功，仅引用 device-virtual + app-service-http-export
- [ ] 节点属性满足策略 `constraints`
- [ ] 节点绑定策略后，agent 日志出现 `redis → core-metadata → core-data → core-command → device-virtual/app-service` 的拉取/启动
- [ ] `redis-cli -p 6379 ping` 返回 `PONG`
- [ ] core-data 端口 59880 可通；device-virtual 产生模拟事件；app-service 能导出

---

## 9. 备选方案：单 composite 服务

若上面的跨容器发现/顺序问题在你的环境里难调，可退化为**一个服务定义**把全部 EdgeX 容器塞进同一个 `deployment.services`，靠 docker 网络用服务名（`redis`、`core-data` …）互相发现，不再用 `requiredServices`。代价是失去单组件可升级性。需要此版本可另出文档。
