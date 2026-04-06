/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpRequest, InvocationContext } from "@azure/functions";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockCreate = jest.fn();
const mockItemRead = jest.fn();
const mockItemDelete = jest.fn();
const mockItemReplace = jest.fn();

const mockTasksQuery = jest.fn();
const mockTasksCreate = jest.fn();
const mockTaskItemRead = jest.fn();
const mockTaskItemDelete = jest.fn();

jest.mock("../../db", () => ({
  listsContainer: {
    items: { query: () => ({ fetchAll: mockQuery }), create: mockCreate },
    item: (_id: string, _pk: string) => ({
      read: mockItemRead,
      delete: mockItemDelete,
      replace: mockItemReplace,
    }),
  },
  tasksContainer: {
    items: {
      query: () => ({ fetchAll: mockTasksQuery }),
      create: mockTasksCreate,
    },
    item: (_id: string, _pk: string) => ({
      read: mockTaskItemRead,
      delete: mockTaskItemDelete,
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
require("../lists");

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockRequest(opts: {
  params?: Record<string, string>;
  body?: any;
}): Partial<HttpRequest> {
  return {
    params: opts.params || {},
    json: async () => opts.body || {},
  };
}

const ctx = {} as InvocationContext;

// ── Tests ────────────────────────────────────────────────────────────────────

describe("getLists", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns existing lists", async () => {
    const lists = [
      { id: "1", name: "Home", tenantId: "shared" },
      { id: "2", name: "Work", tenantId: "test-tenant" },
    ];
    mockQuery.mockResolvedValue({ resources: lists });

    const res = await handlers.getLists(mockRequest({}), ctx);
    expect(res.jsonBody).toEqual(lists);
  });

  it("seeds shared and private lists when none exist", async () => {
    mockQuery.mockResolvedValue({ resources: [] });
    mockCreate.mockResolvedValue({});

    const res = await handlers.getLists(mockRequest({}), ctx);

    // Should create Home (shared), Work and Personal (private)
    expect(mockCreate).toHaveBeenCalledTimes(3);

    const body = res.jsonBody as any[];
    expect(body).toHaveLength(3);
    expect(body[0].name).toBe("Home");
    expect(body[0].tenantId).toBe("shared");
    expect(body[1].name).toBe("Work");
    expect(body[1].tenantId).toBe("test-tenant");
    expect(body[2].name).toBe("Personal");
    expect(body[2].tenantId).toBe("test-tenant");
  });

  it("seeds private defaults when tenant has only shared lists", async () => {
    const shared = [{ id: "1", name: "Home", tenantId: "shared" }];
    mockQuery.mockResolvedValue({ resources: [...shared] });
    mockCreate.mockResolvedValue({});

    const res = await handlers.getLists(mockRequest({}), ctx);

    // Should create Work and Personal for this tenant
    expect(mockCreate).toHaveBeenCalledTimes(2);

    const body = res.jsonBody as any[];
    expect(body).toHaveLength(3);
  });

  it("does not seed when tenant already has private lists", async () => {
    const lists = [
      { id: "1", name: "Home", tenantId: "shared" },
      { id: "2", name: "Work", tenantId: "test-tenant" },
    ];
    mockQuery.mockResolvedValue({ resources: lists });

    const res = await handlers.getLists(mockRequest({}), ctx);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(res.jsonBody).toEqual(lists);
  });
});

describe("createList", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a list with valid name", async () => {
    mockCreate.mockResolvedValue({});

    const res = await handlers.createList(
      mockRequest({ body: { name: "Shopping" } }),
      ctx,
    );

    expect(res.status).toBe(201);
    expect((res.jsonBody as any).name).toBe("Shopping");
    expect((res.jsonBody as any).tenantId).toBe("test-tenant");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("trims whitespace from name", async () => {
    mockCreate.mockResolvedValue({});

    const res = await handlers.createList(
      mockRequest({ body: { name: "  Groceries  " } }),
      ctx,
    );

    expect(res.status).toBe(201);
    expect((res.jsonBody as any).name).toBe("Groceries");
  });

  it("rejects empty name", async () => {
    const res = await handlers.createList(
      mockRequest({ body: { name: "" } }),
      ctx,
    );

    expect(res.status).toBe(400);
    expect((res.jsonBody as any).error).toContain("Name is required");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects name with only whitespace", async () => {
    const res = await handlers.createList(
      mockRequest({ body: { name: "   " } }),
      ctx,
    );

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects name longer than 30 chars", async () => {
    const res = await handlers.createList(
      mockRequest({ body: { name: "a".repeat(31) } }),
      ctx,
    );

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("accepts name exactly 30 chars", async () => {
    mockCreate.mockResolvedValue({});

    const res = await handlers.createList(
      mockRequest({ body: { name: "a".repeat(30) } }),
      ctx,
    );

    expect(res.status).toBe(201);
  });

  it("rejects missing name field", async () => {
    const res = await handlers.createList(mockRequest({ body: {} }), ctx);

    expect(res.status).toBe(400);
  });

  it("rejects non-string name", async () => {
    const res = await handlers.createList(
      mockRequest({ body: { name: 123 } }),
      ctx,
    );

    expect(res.status).toBe(400);
  });
});

describe("deleteList", () => {
  beforeEach(() => jest.clearAllMocks());

  it("deletes list and all its tasks", async () => {
    const tasks = [{ id: "t1" }, { id: "t2" }];
    mockTasksQuery.mockResolvedValue({ resources: tasks });
    mockTaskItemDelete.mockResolvedValue({});
    mockItemDelete.mockResolvedValue({});

    const res = await handlers.deleteList(
      mockRequest({ params: { id: "list-1" } }),
      ctx,
    );

    expect(res.status).toBe(204);
    expect(mockTaskItemDelete).toHaveBeenCalledTimes(2);
    expect(mockItemDelete).toHaveBeenCalledTimes(1);
  });

  it("deletes list with no tasks", async () => {
    mockTasksQuery.mockResolvedValue({ resources: [] });
    mockItemDelete.mockResolvedValue({});

    const res = await handlers.deleteList(
      mockRequest({ params: { id: "list-1" } }),
      ctx,
    );

    expect(res.status).toBe(204);
    expect(mockTaskItemDelete).not.toHaveBeenCalled();
    expect(mockItemDelete).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when id is missing", async () => {
    const res = await handlers.deleteList(
      mockRequest({ params: {} }),
      ctx,
    );

    expect(res.status).toBe(400);
    expect((res.jsonBody as any).error).toContain("Missing id");
  });
});
