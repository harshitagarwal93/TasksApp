import * as nodeCrypto from "crypto";
if (typeof globalThis.crypto === "undefined") {
  (globalThis as unknown as { crypto: typeof nodeCrypto }).crypto = nodeCrypto;
}

import { CosmosClient } from "@azure/cosmos";

const client = new CosmosClient(process.env.COSMOSDB_CONNECTION_STRING!);
const database = client.database("taskapp");

export const listsContainer = database.container("lists");
export const tasksContainer = database.container("tasks");
export const tenantId = process.env.TENANT_ID || "default";

// Fields to project from task documents (skips Cosmos metadata: _rid/_self/_etag/_attachments/_ts)
export const TASK_FIELDS = "c.id, c.listId, c.text, c.isCurrent, c.isDone, c.createdAt, c.completedAt, c.sortOrder";
export const LIST_FIELDS = "c.id, c.name, c.tenantId, c.createdAt";
