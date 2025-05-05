// read file name from arguments
import { readFileSync } from 'fs';
import { compareVersions } from 'compare-versions';
import { RadixTree } from './radix_tree';
import path from 'path';

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
  // Regular expression to match PropositionE blocks
  const propositionRegex =
    /\\PropositionE\{([\d\.]+)\}\s*\{([^}]+)\}([\s\S]*?)(?=\\PropositionE|$)/g;

  // Extract all proposition matches
  let match;
  const matches: { id: string; title: string; content: string }[] = [];

  while ((match = propositionRegex.exec(texContent)) !== null) {
    matches.push({
      id: match[1], // Proposition number (e.g., "5.14")
      title: match[2], // Proposition title
      content: match[3].trim() // Additional content after the title
    });
  }

  interface Proposition {
    id: string;
    title: string;
    text: string;
    level: number;
    children: Proposition[];
  }

  // Create the radix tree
  const radixTree = new RadixTree<Proposition>();
  // Root node of our tree
  const root: Proposition = {
    id: 'root',
    title: 'Propositions',
    text: 'Propositions',
    children: [],
    level: 0
  };

  const map = { id: 0 };
  // const Q = [map];
  // const readqueue = [];
  // while (Q.length !== 0) {
  //   const curr = Q.pop();
  //   if (typeof curr !== 'object') continue;
  //   const children = [];
  //   Object.keys(curr).forEach((key) => {
  //     if (key !== 'href') {
  //       const child = curr[key];
  //       children.push(child);
  //       Q.push(child);
  //       delete curr[key];
  //     }
  //   });
  //   if (children.length !== 0) {
  //     curr.children = children;
  //   }
  //   if (!curr.id && curr.href) {
  //     const match = curr.href.match(/\d+/);
  //     if (match) {
  //       curr.id = match[0];
  //       readqueue.push({
  //         node: curr,
  //         href: path.join(process.cwd(), 'data', curr.href)
  //       });
  //     }
  //   }
  // }

  const nesting = { id: 0, children: [] };

  // Create nodes for all propositions and insert into radix tree
  for (const prop of matches) {
    // Create the node
    const node: Proposition = {
      id: prop.id,
      title: prop.title,
      text: `\\PropositionE{${prop.id}}{${prop.title}}${prop.content}`,
      children: []
    };
    const path = prop.id.replace('.', '').split('') as string[];
    let curr = nesting;
    let pref = '';
    while (path.length > 0) {
      const key = path.shift()!;
      pref += key;
      curr.children = curr.children || [];
      let branch = null;
      for (const k of curr.children) {
        if (k.id === pref) branch = k;
      }
      if (!branch) {
        branch = {
          id: pref,
          children: []
        };
        curr.children.push(branch);
      }

      // if (!curr.children[key]) {
      //   curr.children[key] = {
      //     id: pref,
      //     children: {}
      //   };
      // }
      curr = branch;
    }
    curr.data = prop;
  }
  console.log('Nesting:', JSON.stringify(nesting, undefined, 2));

  // const Q = [map];
  // const readqueue = [];
  // while (Q.length !== 0) {
  //   const curr = Q.pop();
  //   if (typeof curr !== 'object') continue;
  //   const children = [];
  //   Object.keys(curr).forEach((key) => {
  //     if (key !== 'href') {
  //       const child = curr[key];
  //       children.push(child);
  //       Q.push(child);
  //       delete curr[key];
  //     }
  //   });
  //   if (children.length !== 0) {
  //     curr.children = children;
  //   }
  // }

  //console.log('Map:', JSON.stringify(map));

  // Build the tree structure using the radix tree
  // const allNodes = radixTree.getAllSorted();

  // for (const node of allNodes) {
  //   const parentNode = radixTree.findParent(node.id);
  //   console.log('Parent node:', node.id, parentNode?.data?.id);

  //   if (parentNode === radixTree.root) {
  //     // This is a top-level node, add to root
  //     console.log('Adding to root:', node);
  //     root.children.push(node);
  //   } else if (parentNode && parentNode.data) {
  //     // Add to parent node's children
  //     console.log('Adding to parent:', parentNode.data.id, node.id);
  //     parentNode.data.children.push(node);
  //   }
  // }

  return { root };
}

console.log('Parsed tree:', JSON.stringify(parse(fileContent), null, 2));
