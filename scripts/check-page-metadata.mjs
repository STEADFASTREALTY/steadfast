import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function findPages(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return findPages(target);
    return entry.isFile() && entry.name === "page.tsx" ? [target] : [];
  }));
  return nested.flat();
}

const pages = await findPages(path.resolve("app"));
const missing = [];
for (const page of pages) {
  const source = await readFile(page, "utf8");
  const hasStaticMetadata = /export\s+const\s+metadata\b/.test(source);
  const hasGeneratedMetadata = /export\s+(?:async\s+)?function\s+generateMetadata\b/.test(source);
  const hasTitle = /\btitle\s*:/.test(source);
  const hasDescription = /\bdescription\s*:/.test(source);
  if ((!hasStaticMetadata && !hasGeneratedMetadata) || !hasTitle || !hasDescription) {
    missing.push(path.relative(process.cwd(), page));
  }
}

if (missing.length) {
  console.error(`Every page must export metadata with a title and description. Missing or incomplete:\n${missing.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Metadata contract verified for ${pages.length} pages.`);
}
