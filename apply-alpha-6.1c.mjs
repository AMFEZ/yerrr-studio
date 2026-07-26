import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pagePath = path.join(root, "app", "page.tsx");
const sidebarPath = path.join(root, "components", "dashboard", "Sidebar.tsx");
const versionPath = path.join(root, "lib", "studioVersion.ts");

function fail(message) {
  console.error(`\nAlpha 6.1C stopped: ${message}\n`);
  process.exit(1);
}

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Could not find ${path.relative(root, filePath)}. Run this command from the Studio project root.`);
  }

  return fs.readFileSync(filePath, "utf8");
}

function backup(filePath, content) {
  const backupPath = `${filePath}.alpha-6.1c.bak`;

  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, content, "utf8");
  }
}

const pageSource = readRequired(pagePath);
const sidebarSource = readRequired(sidebarPath);

const headerPattern = /<header className="mb-8 (?:grid gap-6 md:mb-10 lg:grid-cols-\[minmax\(220px,0\.62fr\)_minmax\(0,1\.38fr\)\] lg:items-end|flex flex-col gap-5 md:mb-10 md:flex-row md:items-end md:justify-between)">[\s\S]*?(<DashboardWorkflowActions[\s\S]*?\/>)[\s\S]*?<\/header>/;

const headerMatch = pageSource.match(headerPattern);

if (!headerMatch) {
  fail(
    "The dashboard header did not match the expected Alpha 6.1A/6.1B structure. No files were changed.",
  );
}

const workflowComponent = headerMatch[1];
const centeredHeader = `<header className="mb-8 md:mb-10">
            <div className="mx-auto max-w-4xl text-center">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-yellow-400 sm:text-sm">
                Dashboard
              </p>

              <h1 className="text-balance text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
                The NYC Slang Lexicon
              </h1>

              <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-neutral-400 sm:text-base">
                Capture, review, verify, and publish the living language of New York City.
              </p>
            </div>

            <div className="mt-6">
              ${workflowComponent.trim()}
            </div>
          </header>`;

const nextPageSource = pageSource.replace(headerPattern, centeredHeader);

const roadmapPattern = /\n\s*<div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-4">(?=[\s\S]*?Roadmap)[\s\S]*?(?=\n\s*\{\(props\.userEmail \|\| props\.onLogout\) && \()/;

let nextSidebarSource = sidebarSource;
const roadmapMatch = sidebarSource.match(roadmapPattern);

if (roadmapMatch) {
  nextSidebarSource = sidebarSource.replace(roadmapPattern, "\n");
} else if (/Roadmap/.test(sidebarSource)) {
  fail(
    "A Roadmap label was found, but its wrapper did not match the expected Sidebar structure. No files were changed.",
  );
}

nextSidebarSource = nextSidebarSource.replace(
  /const VERSION_LABEL = "Alpha [^"]+";/,
  'const VERSION_LABEL = "Alpha 6.1C";',
);

backup(pagePath, pageSource);
backup(sidebarPath, sidebarSource);

fs.writeFileSync(pagePath, nextPageSource, "utf8");
fs.writeFileSync(sidebarPath, nextSidebarSource, "utf8");
fs.mkdirSync(path.dirname(versionPath), { recursive: true });
fs.writeFileSync(
  versionPath,
  'export const STUDIO_VERSION = "Alpha 6.1C";\n',
  "utf8",
);

console.log("\nAlpha 6.1C applied successfully.");
console.log("- Centered the dashboard title above the workflow menu.");
console.log("- Gave the compact workflow menu the full content width.");
console.log(roadmapMatch ? "- Removed the Sidebar Roadmap section." : "- Sidebar had no Roadmap section to remove.");
console.log("- Updated Studio version to Alpha 6.1C.");
console.log("- Backups were saved beside the edited files with .alpha-6.1c.bak.\n");
