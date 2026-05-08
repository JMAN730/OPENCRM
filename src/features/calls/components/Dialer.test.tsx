import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Dialer } from "./Dialer";

const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastInfo = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
    info: (...args: unknown[]) => toastInfo(...args),
  },
}));

describe("Dialer", () => {
  beforeEach(() => {
    toastError.mockClear();
    toastSuccess.mockClear();
    toastInfo.mockClear();
  });

  it("appends keypad digits to the phone number", () => {
    render(<Dialer />);
    const input = screen.getByPlaceholderText("000-000-0000") as HTMLInputElement;

    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "3" }));

    expect(input.value).toBe("123");
  });

  it("does not allow more than 15 digits in the phone number", () => {
    render(<Dialer />);
    const input = screen.getByPlaceholderText("000-000-0000") as HTMLInputElement;

    for (let i = 0; i < 20; i++) {
      fireEvent.click(screen.getByRole("button", { name: "5" }));
    }

    expect(input.value).toHaveLength(15);
  });

  it("shows an error toast when starting a call with no number", () => {
    render(<Dialer />);

    // The green call button is the only button without a label — find by class color
    const callButton = document.querySelector(".bg-green-500") as HTMLButtonElement;
    fireEvent.click(callButton);

    expect(toastError).toHaveBeenCalledWith("Please enter a phone number");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("starts a call when a number is present and ends it on the next click", () => {
    render(<Dialer />);
    fireEvent.click(screen.getByRole("button", { name: "5" }));

    let callButton = document.querySelector(".bg-green-500") as HTMLButtonElement;
    fireEvent.click(callButton);
    expect(toastSuccess).toHaveBeenCalledWith("Calling 5...");

    // Second click ends the call
    callButton = document.querySelector(".bg-destructive") as HTMLButtonElement;
    fireEvent.click(callButton);
    expect(toastInfo).toHaveBeenCalledWith("Call ended");
  });
});
