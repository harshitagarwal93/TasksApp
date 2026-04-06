import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddTask from "../pages/AddTask";

// ── Mock api module ──────────────────────────────────────────────────────────

const mockGetLists = vi.fn();
const mockCreateTask = vi.fn();

vi.mock("../api", () => ({
  getLists: (...args: unknown[]) => mockGetLists(...args),
  createTask: (...args: unknown[]) => mockCreateTask(...args),
}));

const lists = [
  { id: "list-1", name: "Home", createdAt: "2024-01-01" },
  { id: "list-2", name: "Work", createdAt: "2024-01-02" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetLists.mockResolvedValue(lists);
  mockCreateTask.mockResolvedValue({
    id: "t1",
    listId: "list-1",
    text: "Test",
    isCurrent: false,
    isDone: false,
  });
});

describe("AddTask", () => {
  it("renders form elements", async () => {
    render(<AddTask onBack={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Add Task" })).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Enter your task..."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Task" })).toBeInTheDocument();
  });

  it("loads lists on mount", async () => {
    render(<AddTask onBack={vi.fn()} />);

    await waitFor(() => {
      expect(mockGetLists).toHaveBeenCalledTimes(1);
    });
  });

  it("shows character count", async () => {
    render(<AddTask onBack={vi.fn()} />);

    expect(screen.getByText("0/100")).toBeInTheDocument();
  });

  it("updates character count as user types", async () => {
    const user = userEvent.setup();
    render(<AddTask onBack={vi.fn()} />);

    const textarea = screen.getByPlaceholderText("Enter your task...");
    await user.type(textarea, "Hello");

    expect(screen.getByText("5/100")).toBeInTheDocument();
  });

  it("disables submit button when text is empty", async () => {
    render(<AddTask onBack={vi.fn()} />);

    await waitFor(() => {
      expect(mockGetLists).toHaveBeenCalled();
    });

    const submitBtn = screen.getByText("Add Task", {
      selector: "button.submit-btn",
    });
    expect(submitBtn).toBeDisabled();
  });

  it("enables submit button when text is valid and list is selected", async () => {
    const user = userEvent.setup();
    render(<AddTask onBack={vi.fn()} />);

    await waitFor(() => {
      expect(mockGetLists).toHaveBeenCalled();
    });

    const textarea = screen.getByPlaceholderText("Enter your task...");
    await user.type(textarea, "Buy groceries");

    const submitBtn = screen.getByText("Add Task", {
      selector: "button.submit-btn",
    });
    await waitFor(() => {
      expect(submitBtn).not.toBeDisabled();
    });
  });

  it("submits task and shows toast", async () => {
    const user = userEvent.setup();
    render(<AddTask onBack={vi.fn()} />);

    await waitFor(() => {
      expect(mockGetLists).toHaveBeenCalled();
    });

    const textarea = screen.getByPlaceholderText("Enter your task...");
    await user.type(textarea, "Buy groceries");

    const submitBtn = screen.getByText("Add Task", {
      selector: "button.submit-btn",
    });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith("list-1", "Buy groceries");
    });

    expect(screen.getByText("Task added!")).toBeInTheDocument();
  });

  it("clears text after successful submission", async () => {
    const user = userEvent.setup();
    render(<AddTask onBack={vi.fn()} />);

    await waitFor(() => {
      expect(mockGetLists).toHaveBeenCalled();
    });

    const textarea = screen.getByPlaceholderText(
      "Enter your task...",
    ) as HTMLTextAreaElement;
    await user.type(textarea, "Buy groceries");
    expect(textarea.value).toBe("Buy groceries");

    const submitBtn = screen.getByText("Add Task", {
      selector: "button.submit-btn",
    });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(textarea.value).toBe("");
    });
  });

  it("calls onBack when back button is clicked", async () => {
    const onBack = vi.fn();
    render(<AddTask onBack={onBack} />);

    fireEvent.click(screen.getByLabelText("Back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("populates list dropdown with fetched lists", async () => {
    render(<AddTask onBack={vi.fn()} />);

    await waitFor(() => {
      const select = screen.getByLabelText("List") as HTMLSelectElement;
      expect(select.options).toHaveLength(2);
      expect(select.options[0].text).toBe("Home");
      expect(select.options[1].text).toBe("Work");
    });
  });
});
