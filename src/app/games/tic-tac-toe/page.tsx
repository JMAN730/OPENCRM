"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

type Player = "X" | "O";
type Square = Player | null;
type Board = Square[];

const EMPTY_BOARD: Board = Array<Square>(9).fill(null);
const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

function getWinner(board: Board): Player | null {
  for (const [a, b, c] of WINNING_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  return null;
}

function getNextPlayer(board: Board): Player {
  const moves = board.filter(Boolean).length;
  return moves % 2 === 0 ? "X" : "O";
}

export default function TicTacToePage() {
  const [board, setBoard] = useState<Board>(EMPTY_BOARD);
  const winner = useMemo(() => getWinner(board), [board]);
  const isDraw = !winner && board.every(Boolean);
  const nextPlayer = getNextPlayer(board);
  const gameOver = Boolean(winner) || isDraw;
  const status = winner
    ? `Player ${winner} wins`
    : isDraw
      ? "Draw game"
      : `Player ${nextPlayer}'s turn`;

  function playSquare(index: number) {
    if (board[index] || gameOver) return;

    setBoard((current) => {
      if (current[index] || getWinner(current)) return current;
      const next = [...current];
      next[index] = getNextPlayer(current);
      return next;
    });
  }

  function resetGame() {
    setBoard(EMPTY_BOARD);
  }

  return (
    <DashboardLayout>
      <div className="crm-content">
        <div className="crm-page-head">
          <div>
            <h1 className="crm-page-title">Tic-tac-toe</h1>
            <div className="crm-page-sub">Two-player local game</div>
          </div>
          <div className="crm-page-head-actions">
            <button type="button" className="crm-btn" onClick={resetGame}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>

        <div className="crm-card" style={{ maxWidth: 420, width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              aria-live="polite"
              style={{
                color: winner ? "var(--crm-accent)" : "var(--crm-fg)",
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              {status}
            </div>

            <div
              role="grid"
              aria-label="Tic-tac-toe board"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(72px, 1fr))",
                gap: 8,
                width: "100%",
              }}
            >
              {board.map((square, index) => {
                const row = Math.floor(index / 3) + 1;
                const column = (index % 3) + 1;

                return (
                  <button
                    key={index}
                    type="button"
                    role="gridcell"
                    aria-label={
                      square
                        ? `Row ${row}, column ${column}: ${square}`
                        : `Row ${row}, column ${column}: empty`
                    }
                    disabled={Boolean(square) || gameOver}
                    onClick={() => playSquare(index)}
                    style={{
                      aspectRatio: "1 / 1",
                      border: "1px solid var(--crm-border)",
                      borderRadius: "var(--crm-radius-md)",
                      background: "var(--crm-bg-card)",
                      color: "var(--crm-fg)",
                      cursor: square || gameOver ? "default" : "pointer",
                      fontSize: 32,
                      fontWeight: 700,
                    }}
                  >
                    {square}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
