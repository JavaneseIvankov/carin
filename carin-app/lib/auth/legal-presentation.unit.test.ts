import { describe, expect, it } from 'vitest';
import { parseLegalMarkdown } from './legal-presentation';

describe('parseLegalMarkdown', () => {
  it('uses blank lines to separate non-empty paragraphs', () => {
    expect(parseLegalMarkdown('Paragraf pertama.\nbaris lanjutannya.\n\nParagraf kedua.')).toEqual([
      {
        type: 'paragraph',
        children: [{ type: 'text', text: 'Paragraf pertama. baris lanjutannya.' }],
      },
      { type: 'paragraph', children: [{ type: 'text', text: 'Paragraf kedua.' }] },
    ]);
  });

  it('presents Markdown headings with their levels and visible text', () => {
    expect(parseLegalMarkdown('# Judul utama\n\n### Bagian kecil')).toEqual([
      { type: 'heading', level: 1, children: [{ type: 'text', text: 'Judul utama' }] },
      { type: 'heading', level: 3, children: [{ type: 'text', text: 'Bagian kecil' }] },
    ]);
  });

  it('keeps a quoted draft warning as a quote block', () => {
    expect(parseLegalMarkdown('> **DRAF — BELUM DISETUJUI.** Perlu ditinjau.')).toEqual([
      {
        type: 'quote',
        children: [
          { type: 'strong', text: 'DRAF — BELUM DISETUJUI.' },
          { type: 'text', text: ' Perlu ditinjau.' },
        ],
      },
    ]);
  });

  it('groups consecutive unordered and ordered list items', () => {
    expect(parseLegalMarkdown('- Satu\n- Dua\n\n1. Pertama\n2. Kedua')).toEqual([
      {
        type: 'list',
        ordered: false,
        items: [[{ type: 'text', text: 'Satu' }], [{ type: 'text', text: 'Dua' }]],
      },
      {
        type: 'list',
        ordered: true,
        items: [[{ type: 'text', text: 'Pertama' }], [{ type: 'text', text: 'Kedua' }]],
      },
    ]);
  });

  it('preserves emphasis while removing its Markdown markers', () => {
    expect(parseLegalMarkdown('Ini **penting** dan *pilihan*.')).toEqual([
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Ini ' },
          { type: 'strong', text: 'penting' },
          { type: 'text', text: ' dan ' },
          { type: 'emphasis', text: 'pilihan' },
          { type: 'text', text: '.' },
        ],
      },
    ]);
  });

  it('keeps safe link labels visible and retains their HTTPS destination', () => {
    expect(
      parseLegalMarkdown('Baca [pemberitahuan privasi](https://example.test/privacy).')
    ).toEqual([
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Baca ' },
          { type: 'link', text: 'pemberitahuan privasi', href: 'https://example.test/privacy' },
          { type: 'text', text: '.' },
        ],
      },
    ]);
  });

  it('shows unsafe link labels as plain text without an active destination', () => {
    expect(parseLegalMarkdown('[teks aman](javascript:alert(1))')).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: 'teks aman' }] },
    ]);
  });
});
