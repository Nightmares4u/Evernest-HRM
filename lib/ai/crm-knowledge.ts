// Loads the CRM planning/architecture markdown files as static context for
// the internal staff assistant. Files live in
// `memory/projects/crm/`. We read them at first request and memoize for the
// life of the process — the docs change rarely and this avoids a disk hit
// per question.

import { promises as fs } from "node:fs";
import path from "node:path";

const DOC_FILES = [
  "INDEX.md",
  "CURRENT_STATE.md",
  "CRM_BOARD.md",
  "CLIENT_LIFECYCLE_STAGE_2_PLAN.md",
  "STAGE_1_DECISIONS.md",
  "CRM_AI_HANDOFF_AND_REFERENCE_ARCHITECTURE.md",
] as const;

// Cap each file's contribution so a single long doc can't crowd out the
// others or blow the model's input window. ~24k chars ≈ ~6k tokens — well
// within Gemini Flash limits with headroom for the question + answer.
const PER_FILE_CHAR_LIMIT = 24_000;

export type CrmKnowledgeSection = {
  file: string;
  excerpt: string;
  truncated: boolean;
};

export type CrmKnowledgeBundle = {
  sections: CrmKnowledgeSection[];
  missing: string[];
};

let cached: CrmKnowledgeBundle | null = null;

function docsDir(): string {
  return path.join(process.cwd(), "memory", "projects", "crm");
}

async function readDoc(file: string): Promise<CrmKnowledgeSection | null> {
  try {
    const raw = await fs.readFile(path.join(docsDir(), file), "utf8");
    const truncated = raw.length > PER_FILE_CHAR_LIMIT;
    return {
      file,
      excerpt: truncated ? `${raw.slice(0, PER_FILE_CHAR_LIMIT)}\n\n[…truncated]` : raw,
      truncated,
    };
  } catch {
    return null;
  }
}

export async function loadCrmKnowledge(): Promise<CrmKnowledgeBundle> {
  if (cached) return cached;

  const results = await Promise.all(DOC_FILES.map((file) => readDoc(file)));
  const sections: CrmKnowledgeSection[] = [];
  const missing: string[] = [];
  results.forEach((section, index) => {
    if (section) sections.push(section);
    else missing.push(DOC_FILES[index]);
  });

  cached = { sections, missing };
  return cached;
}

export function formatKnowledgeForPrompt(bundle: CrmKnowledgeBundle): string {
  if (bundle.sections.length === 0) {
    return "(No CRM documentation could be loaded.)";
  }
  return bundle.sections
    .map(
      (section) =>
        `<<<DOC ${section.file}>>>\n${section.excerpt}\n<<<END ${section.file}>>>`
    )
    .join("\n\n");
}
