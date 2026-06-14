/**
 * Release categories — a small shared taxonomy used by the admin create form,
 * the showcase seed, and the landing filter sidebar. The slug is stored on
 * release_meta.category; the label is what users see.
 */
export interface Category {
  slug: string;
  label: string;
}

export const CATEGORIES: Category[] = [
  { slug: "music", label: "Music & Nightlife" },
  { slug: "tech", label: "Tech & Conferences" },
  { slug: "gaming", label: "Gaming & Dev" },
  { slug: "sports", label: "Sports & Fitness" },
  { slug: "food", label: "Food & Drink" },
  { slug: "arts", label: "Arts & Culture" },
  { slug: "community", label: "Community & Causes" },
  { slug: "health", label: "Health & Wellness" },
  { slug: "retail", label: "Retail & Drops" },
];

const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

export function isCategorySlug(value: string | null | undefined): value is string {
  return Boolean(value && BY_SLUG.has(value));
}

export function categoryLabel(slug: string | null | undefined): string | null {
  return slug ? (BY_SLUG.get(slug)?.label ?? null) : null;
}
