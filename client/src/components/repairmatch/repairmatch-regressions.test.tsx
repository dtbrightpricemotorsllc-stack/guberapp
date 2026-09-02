// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
  useParams: () => ({ id: window.location.pathname.split("/").pop() || "" }),
}));

vi.mock("@/components/repairmatch/shared", () => ({
  DISCLOSURE: "This preliminary assessment requires physical inspection.",
  ErrorState: ({ message }: { message: string }) => <p>{message}</p>,
  Field: ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label>{label}{children}</label>
  ),
  Layout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  panel: "",
  range: (low: unknown, high: unknown, suffix = "") => `${low ?? "?"}–${high ?? "?"}${suffix}`,
  SectionTitle: ({ title }: { title: string }) => <h1>{title}</h1>,
  shell: "",
  Status: ({ value }: { value: string }) => <span>{value}</span>,
  estimateTitle: (estimate: any) => [estimate?.vehicle?.year, estimate?.vehicle?.make, estimate?.vehicle?.model].filter(Boolean).join(" ") || "Vehicle assessment",
}));

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/lib/queryClient", () => ({ apiRequest }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { EstimateDetail } from "./estimate-detail";
import { ShopOpportunity } from "./shop-opportunity";

function renderWithQueryClient(
  screen: React.ReactElement,
  queryFn: (url: string) => unknown,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, queryFn: ({ queryKey }) => Promise.resolve(queryFn(queryKey.join("/"))) },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      {screen}
    </QueryClientProvider>,
  );

  return queryClient;
}

const estimate = {
  id: 42,
  status: "draft",
  vehicle: { year: 2021, make: "Toyota", model: "Camry", zip: "10001" },
  incident: { date: "2026-08-20" },
  photo_urls: ["one.jpg"],
  ai_result: {
    summary: "Visible damage needs shop review.",
    severity: "moderate",
    confidence: 0.9,
    totals: {},
  },
  lines: [{ id: 1, component: "Rear bumper", recommendation: "repair" }],
  responses: [],
};

describe("RepairMatch focused screens", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/");
    vi.clearAllMocks();
  });

  it("enforces sharing approval while keeping direct contact masked before acceptance", async () => {
    window.history.replaceState({}, "", "/repairmatch/42");

    renderWithQueryClient(
      <EstimateDetail />,
      url => url.includes("/shops?zip=10001")
        ? [{ id: 7, company_name: "Reliable Collision", service_radius_miles: 20 }]
        : estimate,
    );

    expect(await screen.findByText(/I approve sharing the vehicle details/)).toBeTruthy();
    expect(screen.getByText(/My direct contact stays private until I accept a shop/)).toBeTruthy();

    const shareButton = screen.getByRole("button", { name: /Share for review/i });
    expect((shareButton as HTMLButtonElement).disabled).toBe(true);

    const shopButton = await screen.findByRole("button", { name: /Reliable Collision/ });
    fireEvent.click(shopButton);
    expect((shareButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox"));
    expect((shareButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("hydrates shop response and reviewed lines once, preserving edits after refetch", async () => {
    window.history.replaceState({}, "", "/biz/repairmatch/9");

    const firstResponse = {
      availability: "Next week",
      customer_note: "Initial customer note",
    };
    const firstReviewedLine = {
      estimateLineId: 1,
      component: "Rear bumper",
      recommendation: "repair",
      notes: "Initial reviewed note",
    };
    const responses = [
      {
        response: firstResponse,
        reviewedLines: [firstReviewedLine],
        lines: [{ id: 1, component: "Original bumper", recommendation: "repair" }],
      },
      {
        response: { availability: "Tomorrow", customer_note: "Refetched customer note" },
        reviewedLines: [{
          estimateLineId: 1,
          component: "Refetched reviewed bumper",
          recommendation: "replace",
          notes: "Refetched reviewed note",
        }],
        lines: [{ id: 1, component: "Refetched original bumper", recommendation: "replace" }],
      },
    ];
    const queryClient = renderWithQueryClient(<ShopOpportunity />, () => responses[0]);

    expect(await screen.findByDisplayValue("Next week")).toBeTruthy();
    expect(screen.getByDisplayValue("Rear bumper")).toBeTruthy();
    expect(screen.getByText("Original bumper")).toBeTruthy();
    expect(screen.getByText(/Customer contact stays hidden until they accept your shop/)).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue("Next week"), { target: { value: "Friday" } });
    fireEvent.change(screen.getByDisplayValue("Rear bumper"), { target: { value: "Edited bumper" } });

    responses.shift();
    await queryClient.refetchQueries({ queryKey: ["/api/repairmatch/shop/opportunities/9"] });

    await waitFor(() => expect(screen.getByText("Refetched original bumper")).toBeTruthy());
    expect(screen.getByDisplayValue("Friday")).toBeTruthy();
    expect(screen.getByDisplayValue("Edited bumper")).toBeTruthy();
    expect(screen.queryByDisplayValue("Tomorrow")).toBeNull();
    expect(screen.queryByDisplayValue("Refetched reviewed bumper")).toBeNull();
  });
});