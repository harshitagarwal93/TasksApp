import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Home from "../pages/Home";

describe("Home", () => {
  it("renders the title", () => {
    render(<Home onAdd={vi.fn()} onView={vi.fn()} />);
    expect(screen.getByText("TaskApp")).toBeInTheDocument();
  });

  it("renders Add Task and View Tasks buttons", () => {
    render(<Home onAdd={vi.fn()} onView={vi.fn()} />);
    expect(screen.getByText("Add Task")).toBeInTheDocument();
    expect(screen.getByText("View Tasks")).toBeInTheDocument();
  });

  it("calls onAdd when Add Task button is clicked", () => {
    const onAdd = vi.fn();
    render(<Home onAdd={onAdd} onView={vi.fn()} />);

    fireEvent.click(screen.getByText("Add Task"));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("calls onView when View Tasks button is clicked", () => {
    const onView = vi.fn();
    render(<Home onAdd={vi.fn()} onView={onView} />);

    fireEvent.click(screen.getByText("View Tasks"));
    expect(onView).toHaveBeenCalledTimes(1);
  });
});
