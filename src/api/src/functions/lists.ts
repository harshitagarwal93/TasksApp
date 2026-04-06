import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { listsContainer, tasksContainer, tenantId } from "../db";
import * as crypto from "crypto";

const SHARED_LISTS = ["Home"];
const PRIVATE_DEFAULTS = ["Work", "Personal"];

app.http("getLists", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "lists",
  handler: async (_request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const { resources } = await listsContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.tenantId = @tid OR c.tenantId = 'shared' ORDER BY c.createdAt",
        parameters: [{ name: "@tid", value: tenantId }]
      })
      .fetchAll();

    if (resources.length === 0) {
      const seeded = [];
      for (const name of SHARED_LISTS) {
        const item = { id: crypto.randomUUID(), name, tenantId: "shared", createdAt: new Date().toISOString() };
        await listsContainer.items.create(item);
        seeded.push(item);
      }
      for (const name of PRIVATE_DEFAULTS) {
        const item = { id: crypto.randomUUID(), name, tenantId, createdAt: new Date().toISOString() };
        await listsContainer.items.create(item);
        seeded.push(item);
      }
      return { jsonBody: seeded };
    }

    // If this tenant has no private lists yet, seed them
    const hasPrivate = resources.some((r: { tenantId: string }) => r.tenantId === tenantId);
    if (!hasPrivate) {
      for (const name of PRIVATE_DEFAULTS) {
        const item = { id: crypto.randomUUID(), name, tenantId, createdAt: new Date().toISOString() };
        await listsContainer.items.create(item);
        resources.push(item);
      }
    }

    return { jsonBody: resources };
  }
});

app.http("createList", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "lists",
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const body = await request.json() as { name?: string };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 30) {
      return { status: 400, jsonBody: { error: "Name is required (max 30 chars)" } };
    }

    const item = { id: crypto.randomUUID(), name, tenantId, createdAt: new Date().toISOString() };
    await listsContainer.items.create(item);
    return { status: 201, jsonBody: item };
  }
});

app.http("deleteList", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "lists/{id}",
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const id = request.params.id;
    if (!id) return { status: 400, jsonBody: { error: "Missing id" } };

    // Delete all tasks in the list
    const { resources: tasks } = await tasksContainer.items
      .query({ query: "SELECT c.id FROM c WHERE c.listId = @listId", parameters: [{ name: "@listId", value: id }] })
      .fetchAll();
    for (const task of tasks) {
      await tasksContainer.item(task.id, id).delete();
    }

    await listsContainer.item(id, id).delete();
    return { status: 204 };
  }
});
