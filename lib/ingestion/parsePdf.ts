import 'server-only';
import { getDocumentProxy, extractText } from 'unpdf';
import type { PageText } from './chunkText';

const URL_ONLY_LINE = /^\s*https?:\/\/\S+\s*$/i;
const PAGE_FRACTION_ONLY_LINE = /^\s*\d+\s*\/\s*\d+\s*$/;

// Header/footer scrape boilerplate (e.g. e-qanun.az) repeats near-identically on
// every page except for a trailing page-fraction / timestamp digit run. Stripping
// that trailing run lets identical boilerplate lines collapse to one normalized
// form so we can detect them by cross-page frequency instead of a hardcoded string.
const TRAILING_DIGIT_RUN = /[\d/]+\s*$/;

function normalizeForFrequency(line: string): string {
  return line.trim().replace(TRAILING_DIGIT_RUN, '').trim();
}

const BOILERPLATE_FREQUENCY_THRESHOLD = 0.55;

function stripBoilerplate(pages: PageText[]): PageText[] {
  const pageLines = pages.map((p) => p.text.split('\n'));

  const candidateLines: string[][] = pageLines.map((lines) =>
    lines.filter((line) => !URL_ONLY_LINE.test(line) && !PAGE_FRACTION_ONLY_LINE.test(line))
  );

  const normalizedCounts = new Map<string, number>();
  for (const lines of candidateLines) {
    const seenOnThisPage = new Set<string>();
    for (const line of lines) {
      const normalized = normalizeForFrequency(line);
      if (!normalized || seenOnThisPage.has(normalized)) continue;
      seenOnThisPage.add(normalized);
      normalizedCounts.set(normalized, (normalizedCounts.get(normalized) ?? 0) + 1);
    }
  }

  const pageCount = pages.length;
  const minOccurrences = pageCount * BOILERPLATE_FREQUENCY_THRESHOLD;
  const boilerplateNormalizedForms = new Set(
    [...normalizedCounts.entries()]
      .filter(([, count]) => count > minOccurrences)
      .map(([normalized]) => normalized)
  );

  return pages.map((page, i) => {
    const keptLines = candidateLines[i].filter(
      (line) => !boilerplateNormalizedForms.has(normalizeForFrequency(line))
    );
    return { pageNumber: page.pageNumber, text: keptLines.join('\n') };
  });
}

export async function parsePdf(buffer: ArrayBuffer): Promise<PageText[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  const pageTexts = pages.map((pageText, i) => ({ pageNumber: i + 1, text: pageText }));
  return stripBoilerplate(pageTexts);
}
