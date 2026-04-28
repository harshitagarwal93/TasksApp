import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { tasksContainer, listsContainer, tenantId, TASK_FIELDS } from "../db";
import * as crypto from "crypto";

// Helper: get list IDs visible to this tenant
async function getVisibleListIds(): Promise<string[]> {
  const { resources } = await listsContainer.items
    .query({
      query: "SELECT c.id FROM c WHERE c.tenantId = @tid OR c.tenantId = 'shared'",
      parameters: [{ name: "@tid", value: tenantId }]
    })
    .fetchAll();
  return resources.map((r: { id: string }) => r.id);
}

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
      // Only return tasks for lists this tenant can see
      const visibleIds = await getVisibleListIds();
      if (visibleIds.length === 0) return { jsonBody: [] };
      query = `SELECT ${TASK_FIELDS} FROM c WHERE ARRAY_CONTAINS(@ids, c.listId) AND ${NOT_ARCHIVED}`;
      parameters = [{ name: "@ids", value: visibleIds as unknown as string }];
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

    const item = {
      id: crypto.randomUUID(),
      listId,
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

    // Read the existing task
    const { resource: existing } = await tasksContainer.item(id, listId).read();
    if (!existing) {
      return { status: 404, jsonBody: { error: "Task not found" } };
    }

    const updated = {
      ...existing,
      ...(typeof body.text === "string" && { text: body.text.trim() }),
      ...(typeof body.isCurrent === "boolean" && { isCurrent: body.isCurrent }),
      ...(body.isDone === true && { isDone: true, isCurrent: false, completedAt: new Date().toISOString() }),
      ...(body.isDone === false && { isDone: false, completedAt: undefined, isArchived: false })
    };

    const { resource } = await tasksContainer.item(id, listId).replace(updated);

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
          const ops = overflow.map((o: { id: string }) => ({
            operationType: "Patch" as const,
            id: o.id,
            resourceBody: {
              operations: [{ op: "set" as const, path: "/isArchived", value: true }]
            }
          }));
          await tasksContainer.items.batch(ops, listId);
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

    // Delete from old partition, create in new one
    const moved = { ...existing, listId: toListId };
    delete moved._rid;
    delete moved._self;
    delete moved._etag;
    delete moved._attachments;
    delete moved._ts;

    await tasksContainer.items.create(moved);
    await tasksContainer.item(id, fromListId).delete();

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
