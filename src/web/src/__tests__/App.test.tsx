import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "../App";

// Mock child components to isolate router logic
vi.mock("../pages/Home", () => ({
  default: ({
    onAdd,
    onView,
  }: {
    onAdd: () => void;
    onView: () => void;
  }) => (
    <div data-testid="home">
      <button onClick={onAdd}>Add Task</button>
      <button onClick={onView}>View Tasks</button>
    </div>
  ),
}));

vi.mock("../pages/AddTask", () => ({
  default: ({ onBack }: { onBack: () => void }) => (
    <div data-testid="add-task">
      <button onClick={onBack}>Back</button>
    </div>
  ),
}));

vi.mock("../pages/ViewTasks", () => ({
  default: ({ onBack }: { onBack: () => void }) => (
    <div data-testid="view-tasks">
      <button onClick={onBack}>Back</button>
    </div>
  ),
}));

describe("App", () => {
  it("renders Home view by default", () => {
    render(<App />);
    expect(screen.getByTestId("home")).toBeInTheDocument();
  });

  it("navigates to AddTask view", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Add Task"));
    expect(screen.getByTestId("add-task")).toBeInTheDocument();
  });

  it("navigates to ViewTasks view", () => {
    render(<App />);
    fireEvent.click(screen.getByText("View Tasks"));
    expect(screen.getByTestId("view-tasks")).toBeInTheDocument();
  });

  it("navigates back from AddTask to Home", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Add Task"));
    expect(screen.getByTestId("add-task")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByTestId("home")).toBeInTheDocument();
  });

  it("navigates back from ViewTasks to Home", () => {
    render(<App />);
    fireEvent.click(screen.getByText("View Tasks"));
    expect(screen.getByTestId("view-tasks")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByTestId("home")).toBeInTheDocument();
  });
});
