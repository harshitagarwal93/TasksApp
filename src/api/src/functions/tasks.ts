import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { PatchOperation } from "@azure/cosmos";
import { tasksContainer, listsContainer, tenantId, TASK_FIELDS } from "../db";
import * as crypto from "crypto";

// In-memory cache of visible list IDs and tenantId map per Function instance (TTL 30s).
// Removed in R1-phase2 once tenantId is denormalized on every task.
let visibleIdsCache: { ids: string[]; map: Map<string, string>; ts: number } | null = null;
const CACHE_TTL_MS = 30_000;

async function getVisibleListsContext(): Promise<{ ids: string[]; map: Map<string, string> }> {
  const now = Date.now();
  if (visibleIdsCache && now - visibleIdsCache.ts < CACHE_TTL_MS) {
    return { ids: visibleIdsCache.ids, map: visibleIdsCache.map };
  }
  const { resources } = await listsContainer.items
    .query({
      query: "SELECT c.id, c.tenantId FROM c WHERE c.tenantId = @tid OR c.tenantId = 'shared'",
      parameters: [{ name: "@tid", value: tenantId }]
    })
    .fetchAll();
  const ids = resources.map((r: { id: string }) => r.id);
  const map = new Map<string, string>(resources.map((r: { id: string; tenantId: string }) => [r.id, r.tenantId]));
  visibleIdsCache = { ids, map, ts: now };
  return { ids, map };
}

// Helper: get tenantId for a list (for createTask/moveTask).
async function getListTenantId(listId: string): Promise<string | null> {
  const { map } = await getVisibleListsContext();
  return map.get(listId) ?? null;
}

function invalidateListsCache() { visibleIdsCache = null; }

// Exclude archived tasks. Cosmos: undefined isArchived is treated as not-archived.
const NOT_ARCHIVED = "(NOT IS_DEFINED(c.isArchived) OR c.isArchived = false)";

app.http("getTasks", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tasks",
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const listId = request.query.get("listId");

    let query: string;
    let parameters: { name: string; value: string }[] = [];

    if (listId) {
      query = `SELECT ${TASK_FIELDS} FROM c WHERE c.listId = @listId AND ${NOT_ARCHIVED}`;
      parameters = [{ name: "@listId", value: listId }];
    } else {
      // R1 phase 2: filter directly on denormalized tenantId. No pre-query for visible list IDs.
      query = `SELECT ${TASK_FIELDS} FROM c WHERE (c.tenantId = @tid OR c.tenantId = 'shared') AND ${NOT_ARCHIVED}`;
      parameters = [{ name: "@tid", value: tenantId }];
    }

    const { resources } = await tasksContainer.items
      .query({ query, parameters })
      .fetchAll();

    const body = JSON.stringify(resources);
    const etag = '"' + crypto.createHash("sha1").update(body).digest("base64").slice(0, 22) + '"';
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch === etag) {
      return { status: 304, headers: { ETag: etag, "Cache-Control": "private, max-age=0, must-revalidate" } };
    }
    return {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate"
      },
      body
    };
  }
});

app.http("getArchivedTasks", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tasks/archived",
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const listId = request.query.get("listId");
    if (!listId) return { status: 400, jsonBody: { error: "listId query param is required" } };

    const { resources } = await tasksContainer.items
      .query({
        query: `SELECT ${TASK_FIELDS} FROM c WHERE c.listId = @listId AND c.isArchived = true ORDER BY c.completedAt DESC`,
        parameters: [{ name: "@listId", value: listId }]
      })
      .fetchAll();

    return { jsonBody: resources };
  }
});

app.http("createTask", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "tasks",
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const body = await request.json() as { listId?: string; text?: string };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const listId = typeof body.listId === "string" ? body.listId.trim() : "";

    if (!text || text.length > 500) {
      return { status: 400, jsonBody: { error: "Text is required (max 500 chars)" } };
    }
    if (!listId) {
      return { status: 400, jsonBody: { error: "listId is required" } };
    }

    const listTenantId = await getListTenantId(listId);
    if (!listTenantId) return { status: 404, jsonBody: { error: "List not found" } };

    const item = {
      id: crypto.randomUUID(),
      listId,
      tenantId: listTenantId,
      text,
      isCurrent: false,
      isDone: false,
      createdAt: new Date().toISOString(),
      sortOrder: Date.now()
    };

    await tasksContainer.items.create(item);
    return { status: 201, jsonBody: item };
  }
});

app.http("updateTask", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "tasks/{id}",
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const id = request.params.id;
    if (!id) return { status: 400, jsonBody: { error: "Missing id" } };

    const body = await request.json() as { listId?: string; text?: string; isCurrent?: boolean; isDone?: boolean };
    const listId = typeof body.listId === "string" ? body.listId.trim() : "";
    if (!listId) {
      return { status: 400, jsonBody: { error: "listId is required" } };
    }

    if (typeof body.text === "string") {
      const trimmedText = body.text.trim();
      if (!trimmedText || trimmedText.length > 500) {
        return { status: 400, jsonBody: { error: "Text is required (max 500 chars)" } };
      }
    }

    // R6: build patch operations instead of read+replace.
    const ops: PatchOperation[] = [];
    if (typeof body.text === "string") ops.push({ op: "set", path: "/text", value: body.text.trim() });
    if (typeof body.isCurrent === "boolean") ops.push({ op: "set", path: "/isCurrent", value: body.isCurrent });
    if (body.isDone === true) {
      ops.push({ op: "set", path: "/isDone", value: true });
      ops.push({ op: "set", path: "/isCurrent", value: false });
      ops.push({ op: "set", path: "/completedAt", value: new Date().toISOString() });
    } else if (body.isDone === false) {
      ops.push({ op: "set", path: "/isDone", value: false });
      ops.push({ op: "set", path: "/completedAt", value: null });
      ops.push({ op: "set", path: "/isArchived", value: false });
    }

    if (ops.length === 0) {
      const { resource: existing } = await tasksContainer.item(id, listId).read();
      if (!existing) return { status: 404, jsonBody: { error: "Task not found" } };
      return { jsonBody: existing };
    }

    let resource;
    try {
      const result = await tasksContainer.item(id, listId).patch(ops);
      resource = result.resource;
    } catch (err: unknown) {
      const e = err as { code?: number; statusCode?: number };
      if (e.code === 404 || e.statusCode === 404) {
        return { status: 404, jsonBody: { error: "Task not found" } };
      }
      throw err;
    }

    // Cap visible done tasks at 100 per list; auto-archive the oldest beyond.
    if (body.isDone === true) {
      try {
        const { resources: overflow } = await tasksContainer.items
          .query({
            query: `SELECT c.id FROM c WHERE c.listId = @listId AND c.isDone = true AND ${NOT_ARCHIVED} ORDER BY c.completedAt ASC OFFSET 100 LIMIT 50`,
            parameters: [{ name: "@listId", value: listId }]
          })
          .fetchAll();
        if (overflow.length > 0) {
          const batchOps = overflow.map((o: { id: string }) => ({
            operationType: "Patch" as const,
            id: o.id,
            resourceBody: {
              operations: [{ op: "set" as const, path: "/isArchived", value: true }]
            }
          }));
          await tasksContainer.items.batch(batchOps, listId);
        }
      } catch { /* archival is best-effort */ }
    }

    return { jsonBody: resource };
  }
});

app.http("moveTask", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "tasks/{id}/move",
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const id = request.params.id;
    if (!id) return { status: 400, jsonBody: { error: "Missing id" } };

    const body = await request.json() as { fromListId?: string; toListId?: string };
    const fromListId = typeof body.fromListId === "string" ? body.fromListId.trim() : "";
    const toListId = typeof body.toListId === "string" ? body.toListId.trim() : "";
    if (!fromListId || !toListId) {
      return { status: 400, jsonBody: { error: "fromListId and toListId are required" } };
    }

    const { resource: existing } = await tasksContainer.item(id, fromListId).read();
    if (!existing) {
      return { status: 404, jsonBody: { error: "Task not found" } };
    }

    const targetTenantId = await getListTenantId(toListId);
    if (!targetTenantId) return { status: 404, jsonBody: { error: "Target list not found" } };

    // R5: idempotent move. If create 409s, the target copy already exists from a previous attempt;
    // proceed to delete the source so we converge to a single copy.
    const moved = { ...existing, listId: toListId, tenantId: targetTenantId };
    delete moved._rid;
    delete moved._self;
    delete moved._etag;
    delete moved._attachments;
    delete moved._ts;

    try {
      await tasksContainer.items.create(moved);
    } catch (err: unknown) {
      const e = err as { code?: number; statusCode?: number };
      if (e.code !== 409 && e.statusCode !== 409) throw err;
      // 409 = target already created on a previous retry; safe to continue.
    }
    try {
      await tasksContainer.item(id, fromListId).delete();
    } catch (err: unknown) {
      const e = err as { code?: number; statusCode?: number };
      if (e.code !== 404 && e.statusCode !== 404) throw err;
      // 404 = source already deleted on a previous retry; safe to ignore.
    }

    return { jsonBody: moved };
  }
});

app.http("deleteTask", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "tasks/{id}",
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const id = request.params.id;
    if (!id) return { status: 400, jsonBody: { error: "Missing id" } };

    const listId = request.query.get("listId");
    if (!listId) return { status: 400, jsonBody: { error: "listId query param is required" } };

    await tasksContainer.item(id, listId).delete();
    return { status: 204 };
  }
});

app.http("reorderTasks", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "tasks/reorder",
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const body = await request.json() as { listId?: string; taskIds?: string[] };
    const listId = typeof body.listId === "string" ? body.listId.trim() : "";
    const taskIds = Array.isArray(body.taskIds) ? body.taskIds.filter(id => typeof id === "string") : [];
    if (!listId) return { status: 400, jsonBody: { error: "listId is required" } };
    if (taskIds.length === 0) return { status: 400, jsonBody: { error: "taskIds is required" } };

    const step = 1000;
    // Cosmos transactional batch limit is 100 ops; chunk if more.
    const CHUNK = 100;
    const updated: { id: string; sortOrder: number }[] = [];
    for (let start = 0; start < taskIds.length; start += CHUNK) {
      const slice = taskIds.slice(start, start + CHUNK);
      const ops = slice.map((id, j) => ({
        operationType: "Patch" as const,
        id,
        resourceBody: {
          operations: [{ op: "set" as const, path: "/sortOrder", value: (start + j + 1) * step }]
        }
      }));
      try {
        await tasksContainer.items.batch(ops, listId);
        slice.forEach((id, j) => updated.push({ id, sortOrder: (start + j + 1) * step }));
      } catch {
        // best-effort; skip failed batch
      }
    }

    return { jsonBody: updated };
  }
});

// One-time backfill: stamp tenantId on every task that lacks it, by joining to its list.
// Protected by ADMIN_KEY. Safe to call multiple times (idempotent: skips tasks that already have tenantId).
app.http("backfillTaskTenants", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "tasks/admin-backfill-tenants",
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey) return { status: 503, jsonBody: { error: "ADMIN_KEY not configured" } };
    if (request.headers.get("x-admin-key") !== adminKey) return { status: 401, jsonBody: { error: "Unauthorized" } };

    // Build listId -> tenantId map from ALL lists (not tenant-filtered).
    const { resources: allLists } = await listsContainer.items
      .query("SELECT c.id, c.tenantId FROM c").fetchAll();
    const listMap = new Map<string, string>(allLists.map((l: { id: string; tenantId: string }) => [l.id, l.tenantId]));

    // Find tasks missing tenantId.
    const { resources: legacy } = await tasksContainer.items
      .query("SELECT c.id, c.listId FROM c WHERE NOT IS_DEFINED(c.tenantId)").fetchAll();

    // Group by partition key (listId) for batched patches.
    const byList = new Map<string, { id: string }[]>();
    let skippedNoList = 0;
    for (const t of legacy as { id: string; listId: string }[]) {
      if (!listMap.has(t.listId)) { skippedNoList++; continue; }
      if (!byList.has(t.listId)) byList.set(t.listId, []);
      byList.get(t.listId)!.push({ id: t.id });
    }

    let patched = 0;
    for (const [lid, items] of byList) {
      const tid = listMap.get(lid)!;
      for (let s = 0; s < items.length; s += 100) {
        const slice = items.slice(s, s + 100);
        const ops = slice.map(it => ({
          operationType: "Patch" as const,
          id: it.id,
          resourceBody: {
            operations: [{ op: "set" as const, path: "/tenantId", value: tid }]
          }
        }));
        try {
          await tasksContainer.items.batch(ops, lid);
          patched += slice.length;
        } catch { /* best-effort */ }
      }
    }

    return { jsonBody: { totalLegacy: legacy.length, patched, skippedNoList } };
  }
});

export { invalidateListsCache };
