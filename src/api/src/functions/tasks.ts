import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { tasksContainer, listsContainer, tenantId } from "../db";
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

app.http("getTasks", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tasks",
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const listId = request.query.get("listId");

    let query: string;
    let parameters: { name: string; value: string }[] = [];

    if (listId) {
      query = "SELECT * FROM c WHERE c.listId = @listId";
      parameters = [{ name: "@listId", value: listId }];
    } else {
      // Only return tasks for lists this tenant can see
      const visibleIds = await getVisibleListIds();
      if (visibleIds.length === 0) return { jsonBody: [] };
      query = `SELECT * FROM c WHERE ARRAY_CONTAINS(@ids, c.listId)`;
      parameters = [{ name: "@ids", value: visibleIds as unknown as string }];
    }

    const { resources } = await tasksContainer.items
      .query({ query, parameters })
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
      ...(body.isDone === false && { isDone: false, completedAt: undefined })
    };

    const { resource } = await tasksContainer.item(id, listId).replace(updated);
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
    const updated: unknown[] = [];
    for (let i = 0; i < taskIds.length; i++) {
      const id = taskIds[i];
      try {
        const { resource: existing } = await tasksContainer.item(id, listId).read();
        if (!existing) continue;
        const next = { ...existing, sortOrder: (i + 1) * step };
        const { resource } = await tasksContainer.item(id, listId).replace(next);
        updated.push(resource);
      } catch {
        // skip missing/failed tasks
      }
    }

    return { jsonBody: updated };
  }
});
