#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceFiles = ["README.md", "SCOPE.md"].concat(
  readdirSync(resolve(repositoryRoot, "docs"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => `docs/${entry.name}`)
    .sort(),
);

const externalTarget = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;
const inlineLink = /!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))/g;
const referenceLink = /^\s{0,3}\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/;

function markdownTargets(line) {
  const targets = [];
  let match;

  inlineLink.lastIndex = 0;
  while ((match = inlineLink.exec(line)) !== null) {
    targets.push(match[1] ?? match[2]);
  }

  match = referenceLink.exec(line);
  if (match !== null) {
    targets.push(match[1] ?? match[2]);
  }

  return targets;
}

function localMarkdownPath(target) {
  if (target.startsWith("#") || externalTarget.test(target)) {
    return null;
  }

  const pathPart = target.split(/[?#]/, 1)[0];
  if (!/\.md$/i.test(pathPart)) {
    return null;
  }

  try {
    return decodeURIComponent(pathPart);
  } catch {
    return pathPart;
  }
}

const missingLinks = [];

for (const sourceFile of sourceFiles) {
  const absoluteSource = resolve(repositoryRoot, sourceFile);
  const lines = readFileSync(absoluteSource, "utf8").split(/\r?\n/);
  let fencedCodeBlock = false;

  lines.forEach((line, index) => {
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      fencedCodeBlock = !fencedCodeBlock;
      return;
    }
    if (fencedCodeBlock) {
      return;
    }

    for (const target of markdownTargets(line)) {
      const localPath = localMarkdownPath(target);
      if (localPath === null) {
        continue;
      }

      const absoluteTarget = resolve(dirname(absoluteSource), localPath);
      if (!existsSync(absoluteTarget) || !statSync(absoluteTarget).isFile()) {
        missingLinks.push({
          sourceFile,
          line: index + 1,
          target,
          resolved: relative(repositoryRoot, absoluteTarget),
        });
      }
    }
  });
}

if (missingLinks.length > 0) {
  for (const missing of missingLinks) {
    console.error(
      `${missing.sourceFile}:${missing.line}: missing Markdown target ` +
        `"${missing.target}" (resolved to "${missing.resolved}")`,
    );
  }
  console.error(`Found ${missingLinks.length} missing Markdown link target(s).`);
  process.exitCode = 1;
} else {
  console.log(`Checked relative Markdown links in ${sourceFiles.length} files.`);
}
