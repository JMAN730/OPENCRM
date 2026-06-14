import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StartJobForm } from "./StartJobForm";

const startMutate = vi.fn();
const createCategoryMutate = vi.fn();
const deleteCategoryMutate = vi.fn();
const invalidateConfig = vi.fn();

vi.mock("@/app/_trpc/client", () => ({
  trpc: {
    useUtils: () => ({ scraper: { config: { invalidate: invalidateConfig } } }),
    scraper: {
      start: {
        useMutation: ({
          onSuccess,
          onError,
        }: {
          onSuccess: () => void;
          onError: (e: Error) => void;
        }) => ({
          mutate: (args: unknown) => {
            startMutate(args);
            onSuccess();
          },
          isPending: false,
        }),
      },
      createCategory: {
        useMutation: ({
          onSuccess,
          onError,
        }: {
          onSuccess: () => void;
          onError: (e: Error) => void;
        }) => ({
          mutate: (args: unknown) => {
            createCategoryMutate(args);
            onSuccess();
          },
          isPending: false,
        }),
      },
      deleteCategory: {
        useMutation: ({
          onSuccess,
          onError,
        }: {
          onSuccess: (result: unknown, variables: { id: string }) => void;
          onError: (e: Error) => void;
        }) => ({
          mutate: (args: { id: string }) => {
            deleteCategoryMutate(args);
            onSuccess(undefined, args);
          },
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const defaultConfig = {
  enabled: true,
  categories: ["Mobile Mechanics", "Landscaping", "Power Washing"] as const,
  orgCategories: [],
  maxLocations: 50,
  maxLimit: 200,
  maxConcurrency: 4,
};

describe("StartJobForm", () => {
  const onStarted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the form with the locations textarea and submit button", () => {
    render(<StartJobForm config={defaultConfig} onStarted={onStarted} />);
    expect(screen.getByLabelText(/Locations/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start scrape/i })).toBeInTheDocument();
  });

  it("renders all built-in category toggles", () => {
    render(<StartJobForm config={defaultConfig} onStarted={onStarted} />);
    expect(screen.getByText("Mobile Mechanics")).toBeInTheDocument();
    expect(screen.getByText("Landscaping")).toBeInTheDocument();
    expect(screen.getByText("Power Washing")).toBeInTheDocument();
  });

  it("shows an error toast when locations field is empty on submit", async () => {
    const { toast } = await import("sonner");
    render(<StartJobForm config={defaultConfig} onStarted={onStarted} />);

    fireEvent.submit(screen.getByRole("button", { name: /Start scrape/i }).closest("form")!);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("location"));
    });
    expect(startMutate).not.toHaveBeenCalled();
  });

  it("submits with parsed locations from newline-separated input", async () => {
    render(<StartJobForm config={defaultConfig} onStarted={onStarted} />);

    // The form splits on newlines, commas, and semicolons, then trims each token.
    // Enter three city names separated by newlines (no commas within a location).
    fireEvent.change(screen.getByLabelText(/Locations/i), {
      target: { value: "Tampa FL\nOrlando FL\nMiami FL" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /Start scrape/i }).closest("form")!);

    await waitFor(() => {
      expect(startMutate).toHaveBeenCalledWith(
        expect.objectContaining({ locations: ["Tampa FL", "Orlando FL", "Miami FL"] }),
      );
    });
    expect(onStarted).toHaveBeenCalled();
  });

  it("submits with semicolon-separated locations", async () => {
    render(<StartJobForm config={defaultConfig} onStarted={onStarted} />);

    fireEvent.change(screen.getByLabelText(/Locations/i), {
      target: { value: "Tampa FL; Orlando FL" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /Start scrape/i }).closest("form")!);

    await waitFor(() => {
      expect(startMutate).toHaveBeenCalledWith(
        expect.objectContaining({ locations: ["Tampa FL", "Orlando FL"] }),
      );
    });
  });

  it("shows an error toast when location count exceeds maxLocations", async () => {
    const { toast } = await import("sonner");
    const config = { ...defaultConfig, maxLocations: 2 };
    render(<StartJobForm config={config} onStarted={onStarted} />);

    fireEvent.change(screen.getByLabelText(/Locations/i), {
      target: { value: "A\nB\nC" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /Start scrape/i }).closest("form")!);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Max 2"));
    });
    expect(startMutate).not.toHaveBeenCalled();
  });

  it("toggles a category into the selection when clicked", async () => {
    render(<StartJobForm config={defaultConfig} onStarted={onStarted} />);

    fireEvent.click(screen.getByText("Landscaping"));
    fireEvent.change(screen.getByLabelText(/Locations/i), { target: { value: "Tampa, FL" } });
    fireEvent.submit(screen.getByRole("button", { name: /Start scrape/i }).closest("form")!);

    await waitFor(() => {
      expect(startMutate).toHaveBeenCalledWith(
        expect.objectContaining({ categories: ["Landscaping"] }),
      );
    });
  });

  it("deselects a category when clicked a second time", async () => {
    render(<StartJobForm config={defaultConfig} onStarted={onStarted} />);

    fireEvent.click(screen.getByText("Landscaping"));
    fireEvent.click(screen.getByText("Landscaping"));
    fireEvent.change(screen.getByLabelText(/Locations/i), { target: { value: "Tampa, FL" } });
    fireEvent.submit(screen.getByRole("button", { name: /Start scrape/i }).closest("form")!);

    await waitFor(() => {
      const call = startMutate.mock.calls[0][0] as { categories?: string[] };
      expect(call.categories).toBeUndefined();
    });
  });

  it("creates a custom category when the add button is clicked", async () => {
    render(<StartJobForm config={defaultConfig} onStarted={onStarted} />);

    fireEvent.change(screen.getByPlaceholderText(/Add custom category/i), {
      target: { value: "Pest Control" },
    });
    fireEvent.click(screen.getByTitle("Add category"));

    await waitFor(() => {
      expect(createCategoryMutate).toHaveBeenCalledWith({ name: "Pest Control" });
    });
  });

  it("creates a custom category on Enter keypress", async () => {
    render(<StartJobForm config={defaultConfig} onStarted={onStarted} />);

    const input = screen.getByPlaceholderText(/Add custom category/i);
    fireEvent.change(input, { target: { value: "Gutters" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(createCategoryMutate).toHaveBeenCalledWith({ name: "Gutters" });
    });
  });

  it("renders org custom categories with delete buttons", () => {
    const config = {
      ...defaultConfig,
      orgCategories: [{ id: "cat-1", name: "Pest Control" }],
    };
    render(<StartJobForm config={config} onStarted={onStarted} />);
    expect(screen.getByText("Pest Control")).toBeInTheDocument();
    expect(screen.getByTitle("Remove category")).toBeInTheDocument();
  });

  it("calls deleteCategory when the remove button for an org category is clicked", async () => {
    const config = {
      ...defaultConfig,
      orgCategories: [{ id: "cat-1", name: "Pest Control" }],
    };
    render(<StartJobForm config={config} onStarted={onStarted} />);

    fireEvent.click(screen.getByTitle("Remove category"));

    await waitFor(() => {
      expect(deleteCategoryMutate).toHaveBeenCalledWith({ id: "cat-1" });
    });
  });

  it("clears the locations field and calls onStarted after a successful submit", async () => {
    render(<StartJobForm config={defaultConfig} onStarted={onStarted} />);

    const textarea = screen.getByLabelText(/Locations/i);
    fireEvent.change(textarea, { target: { value: "Tampa, FL" } });
    fireEvent.submit(screen.getByRole("button", { name: /Start scrape/i }).closest("form")!);

    await waitFor(() => {
      expect(onStarted).toHaveBeenCalled();
    });
  });
});
