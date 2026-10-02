import { describe, it, expect } from 'vitest';
import { parseLatex, tokensToString, type Token } from '../src/text/latex';

const text = (source: string) => tokensToString(parseLatex(source));
const runs = (source: string) =>
  parseLatex(source).filter(
    (t): t is Extract<Token, { type: 'text' }> => t.type === 'text'
  );

describe('parseLatex', () => {
  it('joins source lines and keeps paragraph breaks', () => {
    expect(text('The world is\nall that is the case.\n\nNext.')).toBe(
      'The world is all that is the case.\n\nNext.'
    );
  });

  it('converts logic notation to Unicode', () => {
    expect(text('$(\\exists x) : aRx \\DotOp xRb$')).toBe('(∃x) : aRx . xRb');
    expect(text('$\\Not{(p \\lor q)}$')).toBe('~(p ∨ q)');
    expect(text('$p \\Implies q$')).toBe('p ⊃ q');
    expect(text('$p \\equiv q$ and $p \\BarOp q$')).toBe('p ≡ q and p | q');
  });

  it('italicizes math variables and emphasis', () => {
    const [before, emph, after] = runs('by \\emph{internal} relations');
    expect(before).toMatchObject({ text: 'by ', italic: false });
    expect(emph).toMatchObject({ text: 'internal', italic: true });
    expect(after).toMatchObject({ text: ' relations', italic: false });

    const math = runs('$p \\lor q$');
    expect(math.map((r) => [r.text, r.italic])).toEqual([
      ['p', true],
      [' ∨ ', false],
      ['q', true]
    ]);
  });

  it('marks sub- and superscripts', () => {
    const script = runs('$T_{rs} \\Omega^{\\nu}$');
    expect(script.find((r) => r.text === 'rs')?.script).toBe(-1);
    expect(script.find((r) => r.text === 'ν')?.script).toBe(1);
  });

  it('converts quotes and dashes', () => {
    expect(text("``true'' --- a view---into")).toBe('“true” — a view—into');
  });

  it('drops footnotes, comments and layout commands', () => {
    expect(
      text('The world.\\footnote{A note.}\n% -----File: 097.png---\nEnd.')
    ).toBe('The world. End.');
    expect(text('a\\enlargethispage{\\baselineskip} b')).toBe('a b');
  });

  it('turns table rows into line breaks with column gaps', () => {
    expect(
      text('\\begin{tabular}{c|c}\np & q\\\\\n\\hline\nT & F\\\\\n\\end{tabular}')
    ).toBe('p\u2003q\nT\u2003F');
  });

  it('treats display math environments as math', () => {
    expect(text('define\n\\begin{gather*}\nx = a \\text{ Def.}\n\\end{gather*}')).toBe(
      'define\nx = a Def.'
    );
  });

  it('expands abbreviations without leaving markup behind', () => {
    expect(text('Thus \\exempliGratia: No.~\\PropERef{4.31}')).toBe(
      'Thus e.g.: No.\u00a04.31'
    );
  });
});

describe('parseLatex scripts', () => {
  it('keeps scripts free of spaces so they never wrap', () => {
    const sup = parseLatex('$\\Omega^{1 + 1 \\times 2}$').find(
      (t) => t.type === 'text' && t.script === 1
    );
    expect(sup).toMatchObject({ text: '1+1×2' });
  });
});
