export type LegalInline =
  | { type: 'text' | 'strong' | 'emphasis'; text: string }
  | { type: 'link'; text: string; href: string };

export type LegalBlock =
  | { type: 'heading'; level: number; children: LegalInline[] }
  | { type: 'paragraph' | 'quote'; children: LegalInline[] }
  | { type: 'list'; ordered: boolean; items: LegalInline[][] };

function isSafeHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function parseInline(value: string): LegalInline[] {
  const tokens: LegalInline[] = [];
  const pattern = /\[([^\]]+)\]\(((?:[^()\s]|\([^()]*\))*)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let previousIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > previousIndex)
      tokens.push({ type: 'text', text: value.slice(previousIndex, match.index) });
    if (match[1] !== undefined && match[2] !== undefined) {
      tokens.push(
        isSafeHttpsUrl(match[2])
          ? { type: 'link', text: match[1], href: match[2] }
          : { type: 'text', text: match[1] }
      );
    } else if (match[3] !== undefined) {
      tokens.push({ type: 'strong', text: match[3] });
    } else if (match[4] !== undefined) {
      tokens.push({ type: 'emphasis', text: match[4] });
    }
    previousIndex = pattern.lastIndex;
  }

  if (previousIndex < value.length) tokens.push({ type: 'text', text: value.slice(previousIndex) });
  return tokens.length > 0 ? tokens : [{ type: 'text', text: value }];
}

export function parseLegalMarkdown(markdown: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let paragraph: string[] = [];
  let quote: string[] = [];
  let listItems: string[] = [];
  let listOrdered: boolean | undefined;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', children: parseInline(paragraph.join(' ')) });
      paragraph = [];
    }
  };
  const flushQuote = () => {
    if (quote.length > 0) {
      blocks.push({ type: 'quote', children: parseInline(quote.join(' ')) });
      quote = [];
    }
  };
  const flushList = () => {
    if (listItems.length > 0 && listOrdered !== undefined) {
      blocks.push({ type: 'list', ordered: listOrdered, items: listItems.map(parseInline) });
      listItems = [];
      listOrdered = undefined;
    }
  };
  const flushTextBlocks = () => {
    flushParagraph();
    flushQuote();
    flushList();
  };

  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushTextBlocks();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushTextBlocks();
      blocks.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2]) });
      continue;
    }

    const quoteLine = /^>\s?(.*)$/.exec(trimmed);
    if (quoteLine) {
      flushParagraph();
      flushList();
      quote.push(quoteLine[1]);
      continue;
    }

    const listLine = /^(?:([-*+])|(\d+)[.)])\s+(.+)$/.exec(trimmed);
    if (listLine) {
      flushParagraph();
      flushQuote();
      const ordered = listLine[2] !== undefined;
      if (listOrdered !== undefined && listOrdered !== ordered) flushList();
      listOrdered = ordered;
      listItems.push(listLine[3]);
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      flushTextBlocks();
      continue;
    }

    flushQuote();
    flushList();
    paragraph.push(trimmed);
  }

  flushTextBlocks();
  return blocks;
}
