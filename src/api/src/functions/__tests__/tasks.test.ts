/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpRequest, InvocationContext } from "@azure/functions";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockListsQuery = jest.fn();
const mockTasksQuery = jest.fn();
const mockTasksCreate = jest.fn();
const mockTaskItemRead = jest.fn();
const mockTaskItemDelete = jest.fn();
const mockTaskItemReplace = jest.fn();

jest.mock("../../db", () => ({
  listsContainer: {
    items: { query: () => ({ fetchAll: mockListsQuery }) },
  },
  tasksContainer: {
    items: {
      query: () => ({ fetchAll: mockTasksQuery }),
      create: mockTasksCreate,
    },
    item: (_id: string, _pk: string) => ({
      read: mockTaskItemRead,
      delete: mockTaskItemDelete,
      replace: mockTaskItemReplace,
    }),
  },
  tenantId: "test-tenant",
}));

// Capture handlers registered via app.http
const handlers: Record<string, (req: any, ctx: any) => Promise<any>> = {};
jest.mock("@azure/functions", () => ({
  app: {
    http: (name: string, opts: any) => {
      handlers[name] = opts.handler;
    },
  },
}));

// Force handler registration
require("../tasks");

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockRequest(opts: {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: any;
}): Partial<HttpRequest> {
  return {
    params: opts.params || {},
    query: new URLSearchParams(opts.query || {}) as any,
    json: async () => opts.body || {},
  };
}

const ctx = {} as InvocationContext;

// ── getTasks ─────────────────────────────────────────────────────────────────

describe("getTasks", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns tasks for a specific listId", async () => {
    const tasks = [
      { id: "t1", listId: "list-1", text: "Task 1" },
      { id: "t2", listId: "list-1", text: "Task 2" },
    ];
    mockTasksQuery.mockResolvedValue({ resources: tasks });

    const res = await handlers.getTasks(
      mockRequest({ query: { listId: "list-1" } }),
      ctx,
    );

    expect(res.jsonBody).toEqual(tasks);
  });

  it("returns tasks for visible lists when no listId provided", async () => {
    const visibleLists = [{ id: "list-1" }, { id: "list-2" }];
    mockListsQuery.mockResolvedValue({ resources: visibleLists });

    const allTasks = [{ id: "t1", listId: "list-1", text: "Task" }];
    mockTasksQuery.mockResolvedValue({ resources: allTasks });

    const res = await handlers.getTasks(mockRequest({}), ctx);

    expect(mockListsQuery).toHaveBeenCalled();
    expect(res.jsonBody).toEqual(allTasks);
  });

  it("returns empty array when no visible lists exist", async () => {
    mockListsQuery.mockResolvedValue({ resources: [] });

    const res = await handlers.getTasks(mockRequest({}), ctx);

    expect(res.jsonBody).toEqual([]);
  });
});

// ── createTask ───────────────────────────────────────────────────────────────

describe("createTask", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a task with valid data", async () => {
    mockTasksCreate.mockResolvedValue({});

    const res = await handlers.createTask(
      mockRequest({ body: { listId: "list-1", text: "Buy groceries" } }),
      ctx,
    );

    expect(res.status).toBe(201);
    const body = res.jsonBody as any;
    expect(body.text).toBe("Buy groceries");
    expect(body.listId).toBe("list-1");
    expect(body.isCurrent).toBe(false);
    expect(body.isDone).toBe(false);
    expect(body.createdAt).toBeDefined();
    expect(mockTasksCreate).toHaveBeenCalledTimes(1);
  });

  it("trims whitespace from text", async () => {
    mockTasksCreate.mockResolvedValue({});

    const res = await handlers.createTask(
      mockRequest({ body: { listId: "list-1", text: "  Buy milk  " } }),
      ctx,
    );

    expect(res.status).toBe(201);
    expect((res.jsonBody as any).text).toBe("Buy milk");
  });

  it("rejects empty text", async () => {
    const res = await handlers.createTask(
      mockRequest({ body: { listId: "list-1", text: "" } }),
      ctx,
    );

    expect(res.status).toBe(400);
    expect((res.jsonBody as any).error).toContain("Text is required");
    expect(mockTasksCreate).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only text", async () => {
    const res = await handlers.createTask(
      mockRequest({ body: { listId: "list-1", text: "   " } }),
      ctx,
    );

    expect(res.status).toBe(400);
  });

  it("rejects text longer than 100 chars", async () => {
    const res = await handlers.createTask(
      mockRequest({ body: { listId: "list-1", text: "a".repeat(101) } }),
      ctx,
    );

    expect(res.status).toBe(400);
    expect(mockTasksCreate).not.toHaveBeenCalled();
  });

  it("accepts text exactly 100 chars", async () => {
    mockTasksCreate.mockResolvedValue({});

    const res = await handlers.createTask(
      mockRequest({ body: { listId: "list-1", text: "a".repeat(100) } }),
      ctx,
    );

    expect(res.status).toBe(201);
  });

  it("rejects missing listId", async () => {
    const res = await handlers.createTask(
      mockRequest({ body: { text: "Something" } }),
      ctx,
    );

    expect(res.status).toBe(400);
    expect((res.jsonBody as any).error).toContain("listId is required");
  });

  it("rejects non-string text", async () => {
    const res = await handlers.createTask(
      mockRequest({ body: { listId: "list-1", text: 123 } }),
      ctx,
    );

    expect(res.status).toBe(400);
  });
});

// ── updateTask ───────────────────────────────────────────────────────────────

describe("updateTask", () => {
  beforeEach(() => jest.clearAllMocks());

  it("toggles isCurrent flag", async () => {
    const existing = {
      id: "t1",
      listId: "list-1",
      text: "Task",
      isCurrent: false,
      isDone: false,
    };
    mockTaskItemRead.mockResolvedValue({ resource: existing });
    mockTaskItemReplace.mockResolvedValue({
      resource: { ...existing, isCurrent: true },
    });

    const res = await handlers.updateTask(
      mockRequest({
        params: { id: "t1" },
        body: { listId: "list-1", isCurrent: true },
      }),
      ctx,
    );

    expect(res.jsonBody).toBeDefined();
    expect(mockTaskItemReplace).toHaveBeenCalledTimes(1);
    const replaceArg = mockTaskItemReplace.mock.calls[0][0];
    expect(replaceArg.isCurrent).toBe(true);
  });

  it("marks task as done (sets isDone, resets isCurrent, sets completedAt)", async () => {
    const existing = {
      id: "t1",
      listId: "list-1",
      text: "Task",
      isCurrent: true,
      isDone: false,
    };
    mockTaskItemRead.mockResolvedValue({ resource: existing });
    mockTaskItemReplace.mockResolvedValue({ resource: {} });

    await handlers.updateTask(
      mockRequest({
        params: { id: "t1" },
        body: { listId: "list-1", isDone: true },
      }),
      ctx,
    );

    const replaceArg = mockTaskItemReplace.mock.calls[0][0];
    expect(replaceArg.isDone).toBe(true);
    expect(replaceArg.isCurrent).toBe(false);
    expect(replaceArg.completedAt).toBeDefined();
  });

  it("reopens a completed task (clears isDone and completedAt)", async () => {
    const existing = {
      id: "t1",
      listId: "list-1",
      text: "Task",
      isCurrent: false,
      isDone: true,
      completedAt: "2024-01-01T00:00:00Z",
    };
    mockTaskItemRead.mockResolvedValue({ resource: existing });
    mockTaskItemReplace.mockResolvedValue({ resource: {} });

    await handlers.updateTask(
      mockRequest({
        params: { id: "t1" },
        body: { listId: "list-1", isDone: false },
      }),
      ctx,
    );

    const replaceArg = mockTaskItemReplace.mock.calls[0][0];
    expect(replaceArg.isDone).toBe(false);
    expect(replaceArg.completedAt).toBeUndefined();
  });

  it("returns 404 when task not found", async () => {
    mockTaskItemRead.mockResolvedValue({ resource: undefined });

    const res = await handlers.updateTask(
      mockRequest({
        params: { id: "missing" },
        body: { listId: "list-1", isCurrent: true },
      }),
      ctx,
    );

    expect(res.status).toBe(404);
    expect(mockTaskItemReplace).not.toHaveBeenCalled();
  });

  it("returns 400 when id is missing", async () => {
    const res = await handlers.updateTask(
      mockRequest({
        params: {},
        body: { listId: "list-1", isCurrent: true },
      }),
      ctx,
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 when listId is missing", async () => {
    const res = await handlers.updateTask(
      mockRequest({
        params: { id: "t1" },
        body: { isCurrent: true },
      }),
      ctx,
    );

    expect(res.status).toBe(400);
    expect((res.jsonBody as any).error).toContain("listId is required");
  });
});

// ── moveTask ─────────────────────────────────────────────────────────────────

describe("moveTask", () => {
  beforeEach(() => jest.clearAllMocks());

  it("moves task between lists", async () => {
    const existing = {
      id: "t1",
      listId: "list-1",
      text: "Task",
      _rid: "r",
      _self: "s",
      _etag: "e",
      _attachments: "a",
      _ts: 123,
    };
    mockTaskItemRead.mockResolvedValue({ resource: existing });
    mockTasksCreate.mockResolvedValue({});
    mockTaskItemDelete.mockResolvedValue({});

    const res = await handlers.moveTask(
      mockRequest({
        params: { id: "t1" },
        body: { fromListId: "list-1", toListId: "list-2" },
      }),
      ctx,
    );

    const body = res.jsonBody as any;
    expect(body.listId).toBe("list-2");
    // Cosmos metadata should be stripped
    expect(body._rid).toBeUndefined();
    expect(body._self).toBeUndefined();
    expect(body._etag).toBeUndefined();
    expect(body._attachments).toBeUndefined();
    expect(body._ts).toBeUndefined();
    expect(mockTasksCreate).toHaveBeenCalledTimes(1);
    expect(mockTaskItemDelete).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when task not found", async () => {
    mockTaskItemRead.mockResolvedValue({ resource: undefined });

    const res = await handlers.moveTask(
      mockRequest({
        params: { id: "missing" },
        body: { fromListId: "list-1", toListId: "list-2" },
      }),
      ctx,
    );

    expect(res.status).toBe(404);
    expect(mockTasksCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when fromListId is missing", async () => {
    const res = await handlers.moveTask(
      mockRequest({
        params: { id: "t1" },
        body: { toListId: "list-2" },
      }),
      ctx,
    );

    expect(res.status).toBe(400);
    expect((res.jsonBody as any).error).toContain(
      "fromListId and toListId are required",
    );
  });

  it("returns 400 when toListId is missing", async () => {
    const res = await handlers.moveTask(
      mockRequest({
        params: { id: "t1" },
        body: { fromListId: "list-1" },
      }),
      ctx,
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 when id is missing", async () => {
    const res = await handlers.moveTask(
      mockRequest({
        params: {},
        body: { fromListId: "list-1", toListId: "list-2" },
      }),
      ctx,
    );

    expect(res.status).toBe(400);
  });
});

// ── deleteTask ───────────────────────────────────────────────────────────────

describe("deleteTask", () => {
  beforeEach(() => jest.clearAllMocks());

  it("deletes a task", async () => {
    mockTaskItemDelete.mockResolvedValue({});

    const res = await handlers.deleteTask(
      mockRequest({
        params: { id: "t1" },
        query: { listId: "list-1" },
      }),
      ctx,
    );

    expect(res.status).toBe(204);
    expect(mockTaskItemDelete).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when id is missing", async () => {
    const res = await handlers.deleteTask(
      mockRequest({
        params: {},
        query: { listId: "list-1" },
      }),
      ctx,
    );

    expect(res.status).toBe(400);
    expect((res.jsonBody as any).error).toContain("Missing id");
  });

  it("returns 400 when listId query param is missing", async () => {
    const res = await handlers.deleteTask(
      mockRequest({
        params: { id: "t1" },
        query: {},
      }),
      ctx,
    );

    expect(res.status).toBe(400);
    expect((res.jsonBody as any).error).toContain(
      "listId query param is required",
    );
  });
});
