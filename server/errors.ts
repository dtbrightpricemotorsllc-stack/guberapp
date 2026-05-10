export class DuplicateSlugError extends Error {
  constructor(slug: string) {
    super(`slug already exists: ${slug}`);
    this.name = "DuplicateSlugError";
  }
}
