# Nereid Exchange UI (NereidAI)

Nereid Exchange UI is a modern, lightweight Web Management Portal and BFF (Backend-For-Frontend) proxy gateway designed specifically for the **Open Horizon Management Hub**.

It provides an intuitive visual interface to simplify the service lifecycle and edge resource management in Open Horizon. With NereidAI, operators can seamlessly manage edge nodes, service definitions, deployment patterns, deployment policies, management policies, Agreement Bots (AgBots), and High Availability (HA) node groups.

---

## 🚀 Key Features

1. **Modern Management Interface**
   - Built with **React 18**, **Vite 5**, and **Ant Design 5 (antd)** for a sleek, responsive, and interactive user experience.
   - Built-in multi-lingual support, fully localized in **English** and **Simplified Chinese (`zh-CN`)**.

2. **Session-Based Authentication Proxy**
   - Keeps your Open Horizon Exchange credentials secure. Credentials are strictly held in-memory in the BFF layer and are never persisted in the browser storage.
   - Securely proxies Basic Auth requests to the Open Horizon API.

3. **Automated Deployment Signing & Key Management**
   - When creating or updating service definitions, the BFF proxy **automatically signs deployment configurations** using the RSA-PSS SHA-256 algorithm.
   - Automatically uploads the corresponding public key to the Exchange (`services/{id}/keys/default.public.key`), eliminating manual cryptographic signing steps.

4. **Interactive JSON Importers**
   - Seamlessly import services, deployment patterns, deployment policies, and management policies via JSON files.
   - Automatically detects template variables (e.g., `$HZN_ORG_ID`, `$SERVICE_NAME`, `$SERVICE_VERSION`) and offers an interactive UI to replace them in real-time.

5. **Cross-Organization Support**
   - Browse public services and patterns across different organizations.
   - Supports special headers (like `X-Root-Auth` and `X-Agbot-Auth`) for administrative tasks and high-privilege operations.

6. **HA Node Groups**
   - Configure, manage, and monitor High Availability groups, node memberships, and network configurations.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite 5, React Router Dom v6, Ant Design v5, TypeScript
- **Backend (BFF Proxy)**: Express 5, Node.js (Crypto API)
- **Deployment & Config**: OpenAPI 3.0 (YAML), Docker & Docker Compose, Makefile

---

## 📁 Project Structure

```text
NereidAI/
├── src/                    # Frontend React Source Code
│   ├── api/                # API Request Layer (calling BFF APIs)
│   ├── components/         # Common UI Components and AppLayout
│   ├── i18n/               # Multi-lingual translations (zh.ts, context)
│   ├── pages/              # UI Page Modules (Dashboard, Nodes, Services, Agbots, etc.)
│   ├── App.tsx             # Route configurations & core App structure
│   └── main.tsx            # React application mount entrypoint
├── server/                 # BFF Proxy Server (Express)
│   ├── index.cjs           # Backend entrypoint (routes, proxying, whitelisting)
│   └── sign-utils.cjs      # Cryptographic utils (RSA-PSS SHA-256 generator/signer)
├── deploy/                 # Open Horizon Hub & Agbot Deployment Templates
│   ├── yiqisoft.cfg        # Management Hub config blueprint (ports, credentials, orgs)
│   ├── deploy-myorg-agbot.sh  # Automatic Agbot deployment script
│   ├── docker-compose.myorg-agbot.yml  # Agbot Compose file
│   └── myorg-agbot.json    # Agbot configuration template
├── docs/                   # Documentation and API specs
│   └── openapi.yaml        # BFF API specification in OpenAPI 3.0 (YAML)
├── tsconfig.json           # TypeScript configuration
├── vite.config.ts          # Vite configuration with backend API proxying
└── package.json            # Node.js dependencies and script shortcuts
```

---

## 🚦 Getting Started (Local Development)

### 1. Install Dependencies

Install all dependencies for both frontend and BFF server:

```bash
npm install
```

### 2. Run the Development Servers

For a smooth developer experience, run both the backend BFF and the Vite frontend:

*   **Start BFF Proxy Server**:
    ```bash
    npm run dev:backend
    ```
    The proxy server will listen on `http://localhost:3001`.

*   **Start Vite Frontend**:
    ```bash
    npm run dev
    ```
    The Vite development server will spin up. Frontend requests to `/api/*` are automatically proxied to the BFF at `http://localhost:3001` via settings in `vite.config.ts`.

---

## 🐳 Docker Deployment

The project is equipped with a multi-stage `Dockerfile` and a `docker-compose.yaml` to run frontend and backend as containerized services behind an Nginx reverse proxy.

### Setup and Launch

To build images and start the containers, simply run:

```bash
docker compose up --build -d
```

This will spin up:
1.  `nereid-backend`: The BFF API service running on port `3001` internally.
2.  `nereid-frontend`: An Nginx container listening on public port `80`, serving compiled static assets and reverse-proxying `/api` requests to the backend service.

---

## 🛠️ Makefile Automations

A `Makefile` is provided to speed up common workflows.

| Command | Description |
|---|---|
| `make install` | Install npm packages locally |
| `make build` | Compile and build the React app to `dist/` |
| `make dev-backend`| Run backend BFF in development mode |
| `make dev-frontend`| Run frontend Vite in development mode |
| `make docker-build`| Build production Docker images for frontend and backend |
| `make docker-up` | Build and run containers in background with docker-compose |
| `make docker-down` | Stop and remove running containers |
| `make clean` | Delete temporary files, `dist/`, and `node_modules/` |

---

## 🔌 API Gateway Design

The BFF proxy is carefully designed for optimal safety and performance following the `docs/openapi.yaml` specs:
- **Body Whitelisting**: Strict whitelists (`serviceBody`, `patternBody`, and `sanitizeBody`) filter incoming request bodies to avoid payload pollution and configuration hijacking.
- **In-Memory Sessions**: Login states are saved inside BFF server memory (`sessions[id]`). Only a cryptographically random, ephemeral `sessionId` is returned to the frontend under the `X-Session-Id` header.

---

## 📄 License

This project is licensed under the MIT License.
