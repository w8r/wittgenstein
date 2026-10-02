/**
 * Converts the Tractatus LaTeX source of a proposition into a flat list of
 * styled text tokens that the typesetter can lay out and render.
 *
 * This is deliberately not a TeX engine: it understands the subset of
 * commands that actually occur in data.json (Russell/Wittgenstein logic
 * notation, emphasis, sub/superscripts, simple tables) and maps them to
 * Unicode. Unknown commands are dropped, keeping their arguments' text.
 */

/** Vertical script position: 0 = baseline, 1 = superscript, -1 = subscript. */
export type Script = 0 | 1 | -1;

export type Token =
  | {
      type: 'text';
      text: string;
      /** Emphasis in prose, math italic in math mode */
      italic: boolean;
      script: Script;
      /** Inside TeX math (`$...$`, display math) */
      math: boolean;
    }
  /** Forced line break (`\\`, display math, table rows). */
  | { type: 'break' }
  /** Paragraph break (blank line in the source). */
  | { type: 'par' };

interface Style {
  italic: boolean;
  script: Script;
  math: boolean;
  /** Inline `$...$` math: kept on one line where possible */
  inline?: boolean;
}

/** Spaces inside inline formulas are non-breaking so formulas don't wrap. */
const mathSpace = (style: Style) => (style.inline ? '\u00a0' : ' ');

const endsWithSpace = (token: Token | undefined) =>
  !!token && token.type === 'text' && /[ \u00a0]$/.test(token.text);

/** Commands that expand to a fixed string (valid in text and math mode). */
const SYMBOLS: Record<string, string> = {
  DotOp: '.',
  Implies: '⊃',
  lor: '∨',
  exists: '∃',
  equiv: '≡',
  BarOp: '|',
  vdash: '⊢',
  sharp: '♯',
  flat: '♭',
  aleph: 'ℵ',
  sum: '∑',
  times: '×',
  ldots: '…',
  fourdots: '....',
  fivedots: '.....',
  phi: 'φ',
  psi: 'ψ',
  xi: 'ξ',
  eta: 'η',
  nu: 'ν',
  kappa: 'κ',
  mu: 'μ',
  Omega: 'Ω',
  idEst: 'i.e.',
  IdEst: 'I.e.',
  exempliGratia: 'e.g.',
  ExempliGratia: 'E.g.',
  DittoInWords: '〃'
};

/** Commands rendered as their (single) argument, optionally italic. */
const PASS_THROUGH = new Set(['text', 'mbox', 'textrm', 'smash', 'PropERef']);
const ITALIC = new Set(['emph', 'textit', 'BookTitle']);

/** Commands whose arguments are discarded entirely. */
const DROP_WITH_ARG = new Set([
  'footnote',
  'enlargethispage',
  'hspace',
  'vspace',
  'phantom'
]);

/** Argument-less commands with no visible output. */
const DROP = new Set([
  'limits',
  'hline',
  'Strut',
  'AllowBreak',
  'stretchyspace',
  'verystretchyspace',
  'noindent',
  'centering',
  'footnotesize',
  'baselineskip',
  'textwidth'
]);

/** Environments that open their own block (rendered as forced line breaks). */
const TABLE_ENVS = new Set(['tabular', 'array']);

/** Environments whose body is display math. */
const MATH_ENVS = new Set(['gather*', 'gather', 'align*', 'split', 'equation*']);

/** Binary operators get surrounding spaces in math mode, as in TeX. */
const BINARY_OPS = new Set(['DotOp', 'Implies', 'lor', 'equiv', 'BarOp', 'times']);

export function parseLatex(source: string): Token[] {
  return new Parser(source).parse();
}

/** Plain text of a token list, mainly for debugging and tests. */
export function tokensToString(tokens: Token[]): string {
  return tokens
    .map((t) => (t.type === 'text' ? t.text : t.type === 'break' ? '\n' : '\n\n'))
    .join('');
}

class Parser {
  private pos = 0;
  private tokens: Token[] = [];

  constructor(private src: string) {}

  parse(): Token[] {
    this.parseUntil(null, { italic: false, script: 0, math: false });
    return this.normalize(this.tokens);
  }

  private emit(text: string, style: Style) {
    if (!text) return;
    const last = this.tokens[this.tokens.length - 1];
    if (
      last &&
      last.type === 'text' &&
      last.italic === style.italic &&
      last.script === style.script &&
      last.math === style.math
    ) {
      last.text += text;
    } else {
      this.tokens.push({
        type: 'text',
        text,
        italic: style.italic,
        script: style.script,
        math: style.math
      });
    }
  }

  private emitBreak(type: 'break' | 'par') {
    this.tokens.push({ type });
  }

  /** Parses until `end` (a closing delimiter) or end of input. */
  private parseUntil(end: string | null, style: Style) {
    const src = this.src;
    while (this.pos < src.length) {
      if (end !== null && src.startsWith(end, this.pos)) {
        this.pos += end.length;
        return;
      }
      const ch = src[this.pos];

      if (ch === '%') {
        // Comment to end of line (including the newline)
        const nl = src.indexOf('\n', this.pos);
        this.pos = nl === -1 ? src.length : nl + 1;
        continue;
      }

      if (ch === '\n') {
        // Blank line = paragraph break, single newline = space
        let p = this.pos + 1;
        while (src[p] === ' ' || src[p] === '\t') p++;
        if (src[p] === '\n') {
          while (src[p] === '\n' || src[p] === ' ' || src[p] === '\t') p++;
          this.pos = p;
          this.emitBreak('par');
        } else {
          this.pos++;
          if (!style.math) this.emit(' ', style);
        }
        continue;
      }

      if (ch === '{') {
        this.pos++;
        this.parseUntil('}', style);
        continue;
      }
      if (ch === '}') {
        // Unbalanced closing brace — ignore
        this.pos++;
        continue;
      }

      if (ch === '\\') {
        this.parseCommand(style);
        continue;
      }

      if (ch === '$' && !style.math) {
        this.pos++;
        this.parseUntil('$', { ...style, math: true, inline: true });
        continue;
      }

      if (ch === '&') {
        // Column separator, without the surrounding source spaces
        this.pos++;
        this.skipSpaces();
        const last = this.tokens[this.tokens.length - 1];
        if (last && last.type === 'text') last.text = last.text.replace(/ +$/, '');
        this.emit(' ', { ...style, script: 0 }); // em space between columns
        continue;
      }

      if (ch === '~') {
        this.pos++;
        this.emit(' ', style);
        continue;
      }

      if (style.math) {
        this.parseMathChar(style);
      } else {
        this.parseTextChar(style);
      }
    }
  }

  private parseTextChar(style: Style) {
    const src = this.src;
    if (src.startsWith('``', this.pos)) {
      this.pos += 2;
      this.emit('“', style);
    } else if (src.startsWith("''", this.pos)) {
      this.pos += 2;
      this.emit('”', style);
    } else if (src[this.pos] === '`') {
      this.pos++;
      this.emit('‘', style);
    } else if (src[this.pos] === "'") {
      this.pos++;
      this.emit('’', style);
    } else if (src.startsWith('---', this.pos)) {
      this.pos += 3;
      this.emit('—', style);
    } else if (src.startsWith('--', this.pos)) {
      this.pos += 2;
      this.emit('–', style);
    } else {
      this.emit(src[this.pos], style);
      this.pos++;
    }
  }

  private parseMathChar(style: Style) {
    const src = this.src;
    if (src.startsWith('``', this.pos) || src.startsWith("''", this.pos)) {
      this.emit(src[this.pos] === '`' ? '“' : '”', { ...style, italic: false });
      this.pos += 2;
      return;
    }
    const ch = src[this.pos];
    this.pos++;
    if (ch === '^' || ch === '_') {
      this.parseArg({ ...style, script: ch === '^' ? 1 : -1 });
    } else if (ch === "'") {
      this.emit('′', { ...style, italic: false });
    } else if (ch === ' ' || ch === '\t') {
      // No spaces inside scripts (they would become line break opportunities)
      if (style.script !== 0) return;
      // Collapse runs of math whitespace into one space
      if (!endsWithSpace(this.tokens[this.tokens.length - 1])) {
        this.emit(mathSpace(style), { ...style, italic: false, script: 0 });
      }
    } else {
      // Latin letters are italic in math mode; digits and operators upright
      this.emit(ch, { ...style, italic: /[a-zA-Z]/.test(ch) });
    }
  }

  /** Parses a single argument: a `{group}` or a single character/command. */
  private parseArg(style: Style) {
    this.skipSpaces();
    const ch = this.src[this.pos];
    if (ch === undefined) return;
    if (ch === '{') {
      this.pos++;
      this.parseUntil('}', style);
    } else if (ch === '\\') {
      this.parseCommand(style);
    } else if (style.math) {
      this.parseMathChar(style);
    } else {
      this.parseTextChar(style);
    }
  }

  /** Reads a `{...}` argument as raw source text without emitting it. */
  private readRawArg(): string {
    this.skipSpaces();
    if (this.src[this.pos] !== '{') return '';
    let depth = 0;
    const start = this.pos;
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos++];
      if (ch === '\\') {
        this.pos++;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    return this.src.slice(start + 1, this.pos - 1);
  }

  /** Skips an optional `[...]` argument if present. */
  private skipOptionalArg() {
    this.skipSpaces();
    if (this.src[this.pos] !== '[') return;
    const close = this.src.indexOf(']', this.pos);
    this.pos = close === -1 ? this.src.length : close + 1;
  }

  private skipSpaces() {
    while (this.src[this.pos] === ' ') this.pos++;
  }

  /** Parses `arg` as a nested source fragment with the given style. */
  private emitFragment(fragment: string, style: Style) {
    const saved = { src: this.src, pos: this.pos };
    this.src = fragment;
    this.pos = 0;
    this.parseUntil(null, style);
    this.src = saved.src;
    this.pos = saved.pos;
  }

  private parseCommand(style: Style) {
    const src = this.src;
    this.pos++; // backslash
    const next = src[this.pos];

    // Control symbols
    if (next === '\\') {
      this.pos++;
      this.skipOptionalArg();
      this.emitBreak('break');
      return;
    }
    if (next === '[' || next === ']') {
      // Display math delimiters
      this.pos++;
      this.emitBreak('break');
      if (next === '[') {
        this.parseUntil('\\]', { ...style, math: true, inline: false });
        this.emitBreak('break');
      }
      return;
    }
    if (next === ' ' || next === ',' || next === ';') {
      this.pos++;
      this.emit(style.math ? mathSpace(style) : ' ', { ...style, italic: false });
      return;
    }
    if (next === '-' || next === '!') {
      this.pos++; // discretionary hyphen / negative thin space
      return;
    }
    if (next === '%' || next === '&' || next === '$' || next === '#' || next === '_') {
      this.pos++;
      this.emit(next, style);
      return;
    }

    const match = /^[a-zA-Z]+\*?/.exec(src.slice(this.pos));
    if (!match) {
      this.pos++;
      return;
    }
    const name = match[0];
    this.pos += name.length;
    // TeX swallows spaces after a control word
    this.skipSpaces();

    if (name in SYMBOLS) {
      const symbol = SYMBOLS[name];
      const upright = { ...style, italic: false };
      if (style.math && style.script === 0 && BINARY_OPS.has(name)) {
        if (!endsWithSpace(this.tokens[this.tokens.length - 1])) {
          this.emit(mathSpace(style), upright);
        }
        this.emit(symbol + mathSpace(style), upright);
      } else {
        this.emit(symbol, upright);
      }
      return;
    }
    if (DROP.has(name)) return;
    if (DROP_WITH_ARG.has(name)) {
      this.skipOptionalArg();
      this.readRawArg();
      return;
    }
    if (PASS_THROUGH.has(name)) {
      this.skipOptionalArg();
      this.emitFragment(this.readRawArg(), { ...style, math: false });
      return;
    }
    if (ITALIC.has(name)) {
      this.emitFragment(this.readRawArg(), { ...style, italic: true, math: false });
      return;
    }

    switch (name) {
      case 'Not':
        this.emit('~', { ...style, italic: false });
        this.parseArg(style);
        return;
      case 'overline': {
        // Rendered with a combining overline after the argument
        this.parseArg(style);
        this.emit('̅', { ...style, italic: false });
        return;
      }
      case 'DPtypo':
        // \DPtypo{original}{corrected} — show the corrected text
        this.readRawArg();
        this.parseArg(style);
        return;
      case 'raisebox':
        this.readRawArg();
        this.parseArg(style);
        return;
      case 'frac':
        this.parseArg(style);
        this.emit('/', { ...style, italic: false });
        this.parseArg(style);
        return;
      case 'binom':
        this.emit('(', { ...style, italic: false });
        this.parseArg({ ...style, script: 1 });
        this.parseArg({ ...style, script: -1 });
        this.emit(')', { ...style, italic: false });
        return;
      case 'Illustration':
        this.skipOptionalArg();
        this.readRawArg();
        this.emitBreak('break');
        this.emit('[figure]', { italic: true, script: 0, math: false });
        this.emitBreak('break');
        return;
      case 'begin': {
        const env = this.readRawArg();
        this.skipOptionalArg();
        if (TABLE_ENVS.has(env)) this.readRawArg(); // column spec
        this.emitBreak('break');
        if (MATH_ENVS.has(env) && !style.math) {
          this.parseUntil(`\\end{${env}}`, { ...style, math: true, inline: false });
          this.emitBreak('break');
        }
        return;
      }
      case 'end':
        this.readRawArg();
        this.emitBreak('break');
        return;
      default:
        // Unknown command: drop it, its arguments (if any) render as text
        return;
    }
  }

  /**
   * Cleans up the raw token stream: trims whitespace around breaks,
   * collapses repeated spaces and redundant breaks.
   */
  private normalize(tokens: Token[]): Token[] {
    const out: Token[] = [];
    for (const token of tokens) {
      if (token.type === 'text') {
        token.text = token.text.replace(/ {2,}/g, ' ');
        const last = out[out.length - 1];
        const atLineStart = !last || last.type !== 'text';
        if (atLineStart) token.text = token.text.replace(/^ +/, '');
        if (
          last &&
          last.type === 'text' &&
          last.text.endsWith(' ') &&
          token.text.startsWith(' ')
        ) {
          token.text = token.text.slice(1);
        }
        if (token.text) out.push(token);
        continue;
      }
      // Trim trailing spaces before a break
      const last = out[out.length - 1];
      if (last && last.type === 'text') {
        last.text = last.text.replace(/ +$/, '');
        if (!last.text) out.pop();
      }
      const prev = out[out.length - 1];
      if (!prev) continue; // no breaks at the very start
      if (prev.type !== 'text') {
        // Merge consecutive breaks; a paragraph break wins
        if (token.type === 'par') out[out.length - 1] = token;
        continue;
      }
      out.push(token);
    }
    // No trailing breaks
    while (out.length && out[out.length - 1].type !== 'text') out.pop();
    const last = out[out.length - 1];
    if (last && last.type === 'text') last.text = last.text.replace(/ +$/, '');
    return out;
  }
}
