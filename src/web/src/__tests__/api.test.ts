import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getLists,
  createList,
  deleteList,
  getTasks,
  createTask,
  updateTask,
  moveTask,
  deleteTask,
} from "../api";

// ── Mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── getLists ─────────────────────────────────────────────────────────────────

describe("getLists", () => {
  it("fetches and returns lists", async () => {
    const lists = [{ id: "1", name: "Home", createdAt: "2024-01-01" }];
    mockFetch.mockResolvedValue({ ok: true, json: async () => lists });

    const result = await getLists();

    expect(mockFetch).toHaveBeenCalledWith("/api/lists");
    expect(result).toEqual(lists);
  });

  it("throws on error response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(getLists()).rejects.toThrow("Failed to fetch lists");
  });
});

// ── createList ───────────────────────────────────────────────────────────────

describe("createList", () => {
  it("posts and returns a new list", async () => {
    const newList = { id: "2", name: "Work", createdAt: "2024-01-01" };
    mockFetch.mockResolvedValue({ ok: true, json: async () => newList });

    const result = await createList("Work");

    expect(mockFetch).toHaveBeenCalledWith("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Work" }),
    });
    expect(result).toEqual(newList);
  });

  it("throws on error response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400 });

    await expect(createList("")).rejects.toThrow("Failed to create list");
  });
});

// ── deleteList ───────────────────────────────────────────────────────────────

describe("deleteList", () => {
  it("sends delete request", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await deleteList("list-1");

    expect(mockFetch).toHaveBeenCalledWith("/api/lists/list-1", {
      method: "DELETE",
    });
  });

  it("throws on error response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(deleteList("list-1")).rejects.toThrow(
      "Failed to delete list",
    );
  });
});

// ── getTasks ─────────────────────────────────────────────────────────────────

describe("getTasks", () => {
  it("fetches all tasks when no listId provided", async () => {
    const tasks = [{ id: "t1", text: "Task 1" }];
    mockFetch.mockResolvedValue({ ok: true, json: async () => tasks });

    const result = await getTasks();

    expect(mockFetch).toHaveBeenCalledWith("/api/tasks");
    expect(result).toEqual(tasks);
  });

  it("fetches tasks filtered by listId", async () => {
    const tasks = [{ id: "t1", text: "Task 1", listId: "list-1" }];
    mockFetch.mockResolvedValue({ ok: true, json: async () => tasks });

    const result = await getTasks("list-1");

    expect(mockFetch).toHaveBeenCalledWith("/api/tasks?listId=list-1");
    expect(result).toEqual(tasks);
  });

  it("encodes special characters in listId", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });

    await getTasks("list with spaces");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/tasks?listId=list%20with%20spaces",
    );
  });

  it("throws on error response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(getTasks()).rejects.toThrow("Failed to fetch tasks");
  });
});

// ── createTask ───────────────────────────────────────────────────────────────

describe("createTask", () => {
  it("posts and returns a new task", async () => {
    const task = {
      id: "t1",
      listId: "list-1",
      text: "Buy milk",
      isCurrent: false,
      isDone: false,
    };
    mockFetch.mockResolvedValue({ ok: true, json: async () => task });

    const result = await createTask("list-1", "Buy milk");

    expect(mockFetch).toHaveBeenCalledWith("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listId: "list-1", text: "Buy milk" }),
    });
    expect(result).toEqual(task);
  });

  it("throws on error response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400 });

    await expect(createTask("list-1", "")).rejects.toThrow(
      "Failed to create task",
    );
  });
});

// ── updateTask ───────────────────────────────────────────────────────────────

describe("updateTask", () => {
  it("patches and returns updated task", async () => {
    const updated = { id: "t1", isCurrent: true };
    mockFetch.mockResolvedValue({ ok: true, json: async () => updated });

    const result = await updateTask("t1", "list-1", { isCurrent: true });

    expect(mockFetch).toHaveBeenCalledWith("/api/tasks/t1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCurrent: true, listId: "list-1" }),
    });
    expect(result).toEqual(updated);
  });

  it("sends isDone update", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "t1", isDone: true }),
    });

    await updateTask("t1", "list-1", { isDone: true });

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.isDone).toBe(true);
    expect(body.listId).toBe("list-1");
  });

  it("encodes special characters in id", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await updateTask("id with spaces", "list-1", { isCurrent: true });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/tasks/id%20with%20spaces",
      expect.any(Object),
    );
  });

  it("throws on error response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    await expect(
      updateTask("missing", "list-1", { isCurrent: true }),
    ).rejects.toThrow("Failed to update task");
  });
});

// ── moveTask ─────────────────────────────────────────────────────────────────

describe("moveTask", () => {
  it("posts move and returns task", async () => {
    const moved = { id: "t1", listId: "list-2" };
    mockFetch.mockResolvedValue({ ok: true, json: async () => moved });

    const result = await moveTask("t1", "list-1", "list-2");

    expect(mockFetch).toHaveBeenCalledWith("/api/tasks/t1/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromListId: "list-1", toListId: "list-2" }),
    });
    expect(result).toEqual(moved);
  });

  it("throws on error response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    await expect(moveTask("t1", "list-1", "list-2")).rejects.toThrow(
      "Failed to move task",
    );
  });
});

// ── deleteTask ───────────────────────────────────────────────────────────────

describe("deleteTask", () => {
  it("sends delete request with listId query param", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await deleteTask("t1", "list-1");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/tasks/t1?listId=list-1",
      { method: "DELETE" },
    );
  });

  it("encodes special characters", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await deleteTask("id spaces", "list spaces");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/tasks/id%20spaces?listId=list%20spaces",
      { method: "DELETE" },
    );
  });

  it("throws on error response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(deleteTask("t1", "list-1")).rejects.toThrow(
      "Failed to delete task",
    );
  });
});
