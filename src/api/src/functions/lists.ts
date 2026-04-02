import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { listsContainer, tasksContainer } from "../db";
import * as crypto from "crypto";

const DEFAULT_LISTS = ["Work", "Home", "Personal"];

app.http("getLists", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "lists",
  handler: async (_request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const { resources } = await listsContainer.items
      .query("SELECT * FROM c ORDER BY c.createdAt")
      .fetchAll();

    if (resources.length === 0) {
      const seeded = [];
      for (const name of DEFAULT_LISTS) {
        const item = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
        await listsContainer.items.create(item);
        seeded.push(item);
      }
      return { jsonBody: seeded };
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

    const item = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
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
