// read file name from arguments
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { Node, Proposition } from '../src/types';
import { NONE } from '../src/constants';
import { TexLinebreak } from 'tex-linebreak2';

const measureText = (text) => text.length * 5;

function estimateBox(text: string) {
  const layout = new TexLinebreak(text, {
    measureFn: measureText,
    align: 'left',
    lineWidth: 200
  });

  let width = 0;
  let height = 0;
  const lineHeight = 1;
  layout.lines.forEach((line) => {
    const lineWidth = line.positionedItems.reduce((w, pi) => {
      return Math.max(w, pi.xOffset + pi.width);
    }, 0);
    width = Math.max(width, lineWidth);
    height += lineHeight;
  });
  return { width, height };
}

const fileName = process.argv[2];
if (!fileName) {
  console.error('Please provide a file name as an argument.');
  process.exit(1);
}
const fileContent = readFileSync(path.join(process.cwd(), fileName), 'utf-8');

/**
 * Parse TeX content into a radix tree
 * @param {string} texContent - TeX content to parse
 * @returns {Object} - The root of the tree and the radix tree
 */
function parse(texContent: string) {
  const matches = parseTeXPropositions(texContent);
  for (const prop of matches) {
    Object.assign(prop, estimateBox(prop.content));
  }

  // Create the radix tree
  const root: Node = {
    id: '0',
    parentId: NONE,
    children: [],
    depth: 0,
    width: 0,
    height: 0,
    collapsed: false
  };

  // Create nodes for all propositions and insert into radix tree
  for (const prop of matches) {
    // Create the node
    const path = prop.id.replace('.', '').split('') as string[];
    let curr = root;
    let prefix = '';

    while (path.length > 0) {
      const key = path.shift()!;
      prefix += key;
      curr.children = curr.children || [];
      let branch: Node | null = null;
      for (const k of curr.children) {
        if (k.id === prefix) branch = k;
      }
      if (!branch) {
        branch = {
          id: prefix,
          children: [],
          parentId: curr.id,
          depth: curr.depth + 1,
          width: 0,
          height: 0,
          collapsed: false
        };
        curr.children.push(branch!);
      }

      curr = branch!;
    }
    curr.data = prop;
    curr.width = prop.width;
    curr.height = prop.height;
    curr.collapsed = false;
  }

  // go bottom up and add the parent ids to the nodes
  const queue: Node[] = [root];
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const child of node.children) {
      child.parentId = node.id;
      queue.push(child);
    }
  }

  return root;
}

// write the tree to ./public/data.json
const tree = parse(fileContent);
mkdirSync(path.join(process.cwd(), 'public'), { recursive: true });
writeFileSync(
  path.join(process.cwd(), 'public', 'data.json'),
  JSON.stringify(tree, null, 2)
);

/**
 * Parse TeX propositions with proper handling of nested braces
 * @param texContent The raw TeX content to parse
 * @returns Array of parsed proposition objects
 */
function parseTeXPropositions(texContent: string): Proposition[] {
  const propositions: Proposition[] = [];

  // Pattern to match \PropositionE and the opening brace of its first argument
  const propStartPattern = /\\PropositionE\s*\{/g;

  // Function to find the matching closing brace for a given position
  function findClosingBrace(text: string, startPos: number): number {
    let braceCount = 1;
    let pos = startPos;

    while (braceCount > 0 && pos < text.length) {
      const char = text[pos];
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      pos++;
    }

    return braceCount === 0 ? pos - 1 : -1;
  }

  // Find all proposition starts
  let match;
  let lastEndPos = 0;

  while ((match = propStartPattern.exec(texContent)) !== null) {
    // Starting position of the id argument (after the opening brace)
    const idStartPos = match.index + match[0].length;

    // Find the closing brace of the id argument
    const idEndPos = findClosingBrace(texContent, idStartPos);
    if (idEndPos === -1) continue; // Skip if no matching closing brace

    // Extract the id
    const id = texContent.substring(idStartPos, idEndPos).trim();

    // Find the opening brace of the title argument
    const titleStartPos = texContent.indexOf('{', idEndPos + 1);
    if (titleStartPos === -1) continue; // Skip if no opening brace for title

    // Find the closing brace of the title argument
    const titleEndPos = findClosingBrace(texContent, titleStartPos + 1);
    if (titleEndPos === -1) continue; // Skip if no matching closing brace

    // Extract the title
    const content = texContent.substring(titleStartPos + 1, titleEndPos).trim();

    // Find the content up to the next proposition or end of text
    const nextPropPos = texContent.indexOf('\\PropositionE', titleEndPos + 1);
    const contentEndPos = nextPropPos !== -1 ? nextPropPos : texContent.length;

    // Extract the content (everything after the title's closing brace up to next proposition)
    //const content = texContent.substring(titleEndPos + 1, contentEndPos).trim();

    // Get the raw proposition text
    const raw = texContent.substring(match.index, contentEndPos);

    // Add this proposition to our results
    propositions.push({
      id,
      content,
      width: 0,
      height: 0
    });

    // Update the lastEndPos for the next iteration
    lastEndPos = contentEndPos;

    // Update the regex lastIndex to avoid overlapping matches
    if (nextPropPos !== -1) {
      propStartPattern.lastIndex = nextPropPos;
    }
  }

  return propositions;
}
