export const SERVICE_BROWSE_CATEGORIES = [
  "All",
  "On-Demand Help",
  "General Labor",
  "Skilled Labor",
  "Verify & Inspect",
] as const;

export type ServiceBrowseFilters = {
  search: string | null;
  category: (typeof SERVICE_BROWSE_CATEGORIES)[number] | null;
  availableOnly: boolean;
};

export function parseServiceBrowseFilters(
  urlSearch: string,
  allowedCategories: readonly string[] = SERVICE_BROWSE_CATEGORIES,
): ServiceBrowseFilters {
  const params = new URLSearchParams(urlSearch);
  const q = params.get("q");
  const category = params.get("category");

  return {
    search: q,
    category: category && allowedCategories.includes(category)
      ? category as ServiceBrowseFilters["category"]
      : null,
    availableOnly: params.get("availableNow") === "true",
  };
}