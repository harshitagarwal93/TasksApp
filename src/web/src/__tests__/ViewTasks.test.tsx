import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ViewTasks from "../pages/ViewTasks";

// ── Mock api module ──────────────────────────────────────────────────────────

const mockGetLists = vi.fn();
const mockGetTasks = vi.fn();
const mockCreateList = vi.fn();
const mockDeleteList = vi.fn();
const mockUpdateTask = vi.fn();
const mockMoveTask = vi.fn();
const mockDeleteTask = vi.fn();

vi.mock("../api", () => ({
  getLists: (...args: unknown[]) => mockGetLists(...args),
  getTasks: (...args: unknown[]) => mockGetTasks(...args),
  createList: (...args: unknown[]) => mockCreateList(...args),
  deleteList: (...args: unknown[]) => mockDeleteList(...args),
  updateTask: (...args: unknown[]) => mockUpdateTask(...args),
  moveTask: (...args: unknown[]) => mockMoveTask(...args),
  deleteTask: (...args: unknown[]) => mockDeleteTask(...args),
}));

const lists = [
  { id: "list-1", name: "Home", createdAt: "2024-01-01" },
  { id: "list-2", name: "Work", createdAt: "2024-01-02" },
];

const tasks = [
  {
    id: "t1",
    listId: "list-1",
    text: "Buy groceries",
    isCurrent: false,
    isDone: false,
    createdAt: "2024-01-01",
  },
  {
    id: "t2",
    listId: "list-1",
    text: "Clean house",
    isCurrent: true,
    isDone: false,
    createdAt: "2024-01-02",
  },
  {
    id: "t3",
    listId: "list-2",
    text: "Finish report",
    isCurrent: false,
    isDone: true,
    createdAt: "2024-01-03",
    completedAt: "2024-01-04",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetLists.mockResolvedValue(lists);
  mockGetTasks.mockResolvedValue(tasks);
  mockUpdateTask.mockResolvedValue({});
  mockMoveTask.mockResolvedValue({});
  mockDeleteTask.mockResolvedValue(undefined);
  mockCreateList.mockResolvedValue({
    id: "list-3",
    name: "New List",
    createdAt: "2024-01-05",
  });
  mockDeleteList.mockResolvedValue(undefined);
});

describe("ViewTasks", () => {
  it("shows loading state initially", () => {
    // Delay resolution so loading is visible
    mockGetLists.mockReturnValue(new Promise(() => {}));
    mockGetTasks.mockReturnValue(new Promise(() => {}));

    render(<ViewTasks onBack={vi.fn()} />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("loads and displays lists and tasks", async () => {
    render(<ViewTasks onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Home")).toBeInTheDocument();
      expect(screen.getByText("Work")).toBeInTheDocument();
    });

    expect(screen.getByText("Buy groceries")).toBeInTheDocument();
    // "Clean house" appears in both banner and list since it's a current task
    expect(screen.getAllByText("Clean house").length).toBeGreaterThanOrEqual(1);
  });

  it("shows current tasks in the working banner", async () => {
    render(<ViewTasks onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Working on (1)")).toBeInTheDocument();
    });

    // Clean house is current
    const banner = screen.getByText("Working on (1)").closest(".current-banner");
    expect(banner).toHaveTextContent("Clean house");
  });

  it("toggles task current status (optimistic update)", async () => {
    render(<ViewTasks onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Buy groceries")).toBeInTheDocument();
    });

    // Click on the task row containing "Buy groceries" to toggle current
    const taskRow = screen.getByText("Buy groceries").closest(".task-row");
    fireEvent.click(taskRow!);

    await waitFor(() => {
      expect(mockUpdateTask).toHaveBeenCalledWith("t1", "list-1", {
        isCurrent: true,
      });
    });
  });

  it("marks task as done from the working banner", async () => {
    render(<ViewTasks onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getAllByText("Clean house").length).toBeGreaterThanOrEqual(1);
    });

    // Find the "✓ Done" button in the banner
    const doneButtons = screen.getAllByText("✓ Done");
    fireEvent.click(doneButtons[0]);

    await waitFor(() => {
      expect(mockUpdateTask).toHaveBeenCalledWith("t2", "list-1", {
        isDone: true,
        isCurrent: false,
      });
    });
  });

  it("deletes a task (optimistic update)", async () => {
    render(<ViewTasks onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Buy groceries")).toBeInTheDocument();
    });

    // Find delete button for the task
    const taskRow = screen.getByText("Buy groceries").closest(".task-row");
    const deleteBtn = taskRow!.querySelector(".delete-task-btn");
    fireEvent.click(deleteBtn!);

    await waitFor(() => {
      expect(mockDeleteTask).toHaveBeenCalledWith("t1", "list-1");
    });

    // Task should be removed from the UI immediately
    expect(screen.queryByText("Buy groceries")).not.toBeInTheDocument();
  });

  it("opens move dialog when move button is clicked", async () => {
    render(<ViewTasks onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Buy groceries")).toBeInTheDocument();
    });

    // Find move button for the task
    const taskRow = screen.getByText("Buy groceries").closest(".task-row");
    const moveBtn = taskRow!.querySelector(".move-btn");
    fireEvent.click(moveBtn!);

    expect(screen.getByText("Move to list")).toBeInTheDocument();
    expect(
      screen.getByText("Home (current)"),
    ).toBeInTheDocument();
  });

  it("moves task to another list", async () => {
    render(<ViewTasks onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Buy groceries")).toBeInTheDocument();
    });

    // Open move dialog
    const taskRow = screen.getByText("Buy groceries").closest(".task-row");
    const moveBtn = taskRow!.querySelector(".move-btn");
    fireEvent.click(moveBtn!);

    // Select "Work" as destination
    const workOption = screen.getAllByRole("button").find(
      (btn) => btn.textContent === "Work",
    );
    fireEvent.click(workOption!);

    await waitFor(() => {
      expect(mockMoveTask).toHaveBeenCalledWith("t1", "list-1", "list-2");
    });
  });

  it("adds a new list", async () => {
    const user = userEvent.setup();
    render(<ViewTasks onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Home")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("New list name...");
    await user.type(input, "Shopping");

    const addBtn = screen.getByText("+ List");
    await user.click(addBtn);

    await waitFor(() => {
      expect(mockCreateList).toHaveBeenCalledWith("Shopping");
    });
  });

  it("disables + List button when input is empty", async () => {
    render(<ViewTasks onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Home")).toBeInTheDocument();
    });

    const addBtn = screen.getByText("+ List");
    expect(addBtn).toBeDisabled();
  });

  it("deletes a list", async () => {
    render(<ViewTasks onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Home")).toBeInTheDocument();
    });

    const deleteBtn = screen.getByLabelText("Delete Home");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockDeleteList).toHaveBeenCalledWith("list-1");
    });
  });

  it("toggles completed section expansion", async () => {
    render(<ViewTasks onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Work")).toBeInTheDocument();
    });

    // Work list has one completed task — find the toggle button
    const completedToggle = screen.getByText(/Completed \(1\)/);
    expect(completedToggle).toBeInTheDocument();

    // Completed tasks should be hidden initially
    expect(screen.queryByText("Finish report")).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(completedToggle);
    expect(screen.getByText("Finish report")).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(completedToggle);
    expect(screen.queryByText("Finish report")).not.toBeInTheDocument();
  });

  it("reopens a completed task", async () => {
    render(<ViewTasks onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Work")).toBeInTheDocument();
    });

    // Expand completed section
    const completedToggle = screen.getByText(/Completed \(1\)/);
    fireEvent.click(completedToggle);

    // Find the reopen button
    const reopenBtn = screen.getByText("↩");
    fireEvent.click(reopenBtn);

    await waitFor(() => {
      expect(mockUpdateTask).toHaveBeenCalledWith("t3", "list-2", {
        isDone: false,
      });
    });
  });

  it("calls onBack when back button is clicked", async () => {
    const onBack = vi.fn();
    render(<ViewTasks onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText("Tasks")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows 'No active tasks' for a list with no active tasks", async () => {
    // Only provide completed tasks for Work list, none for Home
    mockGetTasks.mockResolvedValue([
      {
        id: "t3",
        listId: "list-2",
        text: "Done task",
        isCurrent: false,
        isDone: true,
        createdAt: "2024-01-01",
      },
    ]);

    render(<ViewTasks onBack={vi.fn()} />);

    await waitFor(() => {
      const empties = screen.getAllByText("No active tasks");
      expect(empties.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("closes move dialog when cancel is clicked", async () => {
    render(<ViewTasks onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Buy groceries")).toBeInTheDocument();
    });

    // Open move dialog
    const taskRow = screen.getByText("Buy groceries").closest(".task-row");
    const moveBtn = taskRow!.querySelector(".move-btn");
    fireEvent.click(moveBtn!);

    expect(screen.getByText("Move to list")).toBeInTheDocument();

    // Cancel
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Move to list")).not.toBeInTheDocument();
  });

  it("handles API error on load gracefully", async () => {
    mockGetLists.mockRejectedValue(new Error("Network error"));
    mockGetTasks.mockRejectedValue(new Error("Network error"));

    render(<ViewTasks onBack={vi.fn()} />);

    // Should still render without crashing after loading completes
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
  });
});
