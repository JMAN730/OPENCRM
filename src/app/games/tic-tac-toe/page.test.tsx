import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import TicTacToePage from "./page";

vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function square(row: number, column: number) {
  return screen.getByRole("gridcell", {
    name: `Row ${row}, column ${column}: empty`,
  });
}

describe("TicTacToePage", () => {
  it("renders an empty board with X to play first", () => {
    render(<TicTacToePage />);

    expect(screen.getByText("Player X's turn")).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(9);
  });

  it("alternates turns after each move", () => {
    render(<TicTacToePage />);

    fireEvent.click(square(1, 1));
    expect(screen.getByText("Player O's turn")).toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: "Row 1, column 1: X" })).toBeInTheDocument();

    fireEvent.click(square(1, 2));
    expect(screen.getByText("Player X's turn")).toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: "Row 1, column 2: O" })).toBeInTheDocument();
  });

  it("detects a winner and prevents additional moves", () => {
    render(<TicTacToePage />);

    fireEvent.click(square(1, 1));
    fireEvent.click(square(2, 1));
    fireEvent.click(square(1, 2));
    fireEvent.click(square(2, 2));
    fireEvent.click(square(1, 3));

    expect(screen.getByText("Player X wins")).toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: "Row 3, column 3: empty" })).toBeDisabled();
  });

  it("detects a draw", () => {
    render(<TicTacToePage />);

    fireEvent.click(square(1, 1));
    fireEvent.click(square(1, 2));
    fireEvent.click(square(1, 3));
    fireEvent.click(square(2, 1));
    fireEvent.click(square(2, 3));
    fireEvent.click(square(2, 2));
    fireEvent.click(square(3, 1));
    fireEvent.click(square(3, 3));
    fireEvent.click(square(3, 2));

    expect(screen.getByText("Draw game")).toBeInTheDocument();
  });

  it("resets the game", () => {
    render(<TicTacToePage />);

    fireEvent.click(square(1, 1));
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));

    expect(screen.getByText("Player X's turn")).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell", { name: /empty/ })).toHaveLength(9);
  });
});
