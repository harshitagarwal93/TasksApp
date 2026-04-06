# TaskApp

A responsive task management app optimized for both desktop and mobile (iOS). Built on Azure with free-tier services.

## Features

- **Add Task** — Phone-optimized view with text input (100 char limit), list dropdown, and instant toast feedback
- **View Tasks** — Desktop grid / mobile stack layout showing tasks organized by lists
- **Multiple current tasks** — Mark any number of tasks as "working on" across lists
- **Optimistic UI** — All actions update instantly; API syncs in background
- **Move tasks** — Move tasks between lists with a single tap
- **Reopen completed tasks** — Undo completed tasks back to active
- **Multi-tenant** — Two app instances share one database; "Home" list is shared, all other lists are private per tenant

## Architecture

| Layer | Service | SKU | Cost |
|-------|---------|-----|------|
| Frontend | Azure Static Web Apps | Free | $0 |
| API | SWA Managed Functions | Free (included) | $0 |
| Database | Azure Cosmos DB for NoSQL | Free tier (1000 RU/s, 25 GB) | $0 |

```
TaskApp/
├── src/web/          # React + Vite (TypeScript)
│   └── src/pages/    # Home, AddTask, ViewTasks
├── src/api/          # Azure Functions v4 (TypeScript)
│   └── src/functions/ # lists.ts, tasks.ts
├── infra/            # Bicep infrastructure
│   └── main.bicep    # Cosmos DB + 2x SWA
└── azure.yaml        # AZD config
```

## Local Development

```bash
# Install dependencies
cd src/web && npm install
cd src/api && npm install

# Build
cd src/web && npm run build
cd src/api && npm run build

# Run locally (requires SWA CLI + Azure Functions Core Tools)
swa start
```

Set `COSMOSDB_CONNECTION_STRING` in `src/api/local.settings.json` for local Cosmos DB access.

## Deployment

Infrastructure is defined in Bicep and deployed via Azure CLI:

```bash
az deployment group create --resource-group TasksApp --template-file infra/main.bicep \
  --parameters location=centralindia swaLocation=centralus

# Deploy app to each SWA instance using their deployment tokens
swa deploy src/web/dist --api-location src/api --deployment-token <TOKEN>
```

## App Instances

| Instance | Tenant | Shared Lists |
|----------|--------|-------------|
| App 1 | user1 | Home |
| App 2 | user2 | Home |
