import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { tasksContainer } from "../db";
import * as crypto from "crypto";

app.http("getTasks", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tasks",
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const listId = request.query.get("listId");

    let query: string;
    let parameters: { name: string; value: string }[] = [];

    if (listId) {
      query = "SELECT * FROM c WHERE c.listId = @listId ORDER BY c.createdAt ASC";
      parameters = [{ name: "@listId", value: listId }];
    } else {
      query = "SELECT * FROM c ORDER BY c.createdAt ASC";
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

    if (!text || text.length > 100) {
      return { status: 400, jsonBody: { error: "Text is required (max 100 chars)" } };
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
      createdAt: new Date().toISOString()
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

    const body = await request.json() as { listId?: string; isCurrent?: boolean; isDone?: boolean };
    const listId = typeof body.listId === "string" ? body.listId.trim() : "";
    if (!listId) {
      return { status: 400, jsonBody: { error: "listId is required" } };
    }

    // Read the existing task
    const { resource: existing } = await tasksContainer.item(id, listId).read();
    if (!existing) {
      return { status: 404, jsonBody: { error: "Task not found" } };
    }

    const updated = {
      ...existing,
      ...(typeof body.isCurrent === "boolean" && { isCurrent: body.isCurrent }),
      ...(body.isDone === true && { isDone: true, isCurrent: false, completedAt: new Date().toISOString() })
    };

    const { resource } = await tasksContainer.item(id, listId).replace(updated);
    return { jsonBody: resource };
  }
});
