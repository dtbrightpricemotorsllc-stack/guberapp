// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/repairmatch/customer-home", () => ({
  RepairMatchHome: () => <div data-testid="repairmatch-home">customer home</div>,
}));
vi.mock("@/components/repairmatch/estimate-creation", () => ({
  NewEstimate: () => <div data-testid="repairmatch-new">new estimate</div>,
}));
vi.mock("@/components/repairmatch/estimate-detail", () => ({
  EstimateDetail: () => <div data-testid="repairmatch-detail">estimate detail</div>,
}));
vi.mock("@/components/repairmatch/shop-workspace", () => ({
  ShopWorkspace: () => <div data-testid="repairmatch-shop-workspace">shop workspace</div>,
}));
vi.mock("@/components/repairmatch/shop-opportunity", () => ({
  ShopOpportunity: () => <div data-testid="repairmatch-shop-opportunity">shop opportunity</div>,
}));

import RepairMatch from "./repairmatch";

describe("RepairMatch route dispatcher", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/");
  });

  it.each([
    ["/repairmatch", "repairmatch-home"],
    ["/repairmatch/new", "repairmatch-new"],
    ["/repairmatch/42", "repairmatch-detail"],
    ["/biz/repairmatch", "repairmatch-shop-workspace"],
    ["/biz/repairmatch/42", "repairmatch-shop-opportunity"],
  ])("renders %s with its intended focused screen", (path, testId) => {
    window.history.replaceState({}, "", path);

    render(<RepairMatch />);

    expect(screen.getByTestId(testId)).toBeTruthy();
    expect(screen.getAllByTestId(/repairmatch-/)).toHaveLength(1);
  });
});