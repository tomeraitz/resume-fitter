interface ExtractedJobDetails {
  title: string;
  company: string;
  location: string;
  skills: string[];
  description: string;
  extras?: Record<string, string>;
}

function isExtractedJobDetails(data: unknown): data is ExtractedJobDetails {
  if (typeof data !== 'object' || data === null) return false;

  const obj = data as Record<string, unknown>;

  if (typeof obj.title !== 'string' || obj.title.length > 200) return false;
  if (typeof obj.company !== 'string' || obj.company.length > 200) return false;
  if (typeof obj.location !== 'string' || obj.location.length > 200) return false;
  if (typeof obj.description !== 'string' || obj.description.length > 50_000)
    return false;

  if (!Array.isArray(obj.skills) || obj.skills.length > 50) return false;
  if (obj.skills.some((s: unknown) => typeof s !== 'string' || s.length > 100))
    return false;

  // extras is optional — validate bounds when present
  if (obj.extras !== undefined) {
    if (typeof obj.extras !== 'object' || obj.extras === null || Array.isArray(obj.extras))
      return false;
    const entries = Object.entries(obj.extras as Record<string, unknown>);
    if (entries.length > 20) return false;
    for (const [key, val] of entries) {
      if (key.length > 100) return false;
      if (typeof val !== 'string' || val.length > 2000) return false;
    }
  }

  return true;
}

export type { ExtractedJobDetails };
export { isExtractedJobDetails };
