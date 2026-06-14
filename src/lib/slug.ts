import { nanoid } from "nanoid";

export function slugify(...parts: (string | null | undefined)[]): string {
  return (
    parts
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "demo"
  );
}

export async function uniqueSlug(
  base: string,
  existsFn: (slug: string) => Promise<boolean>,
): Promise<string> {
  const taken = await existsFn(base);
  if (!taken) return base;
  let candidate: string;
  do {
    candidate = `${base}-${nanoid(6)}`;
  } while (await existsFn(candidate));
  return candidate;
}
