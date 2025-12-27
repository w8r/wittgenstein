/**
 * A Radix Tree (prefix tree) implementation that can store any type of data
 */
export class RadixTree<T> {
  private root: RadixNode<T>;

  constructor() {
    this.root = {
      key: '',
      isEnd: false,
      children: new Map<string, RadixNode<T>>(),
      data: null
    };
  }

  /**
   * Insert a key and associated data into the tree
   * @param key - The string key
   * @param data - The data to associate with this key
   */
  insert(key: string, data: T): void {
    let currentNode = this.root;
    let currentKey = key;

    while (currentKey.length > 0) {
      // Find matching child if exists
      let matchingPrefix = '';
      let matchingChild: RadixNode<T> | undefined;

      for (const [prefix, child] of currentNode.children.entries()) {
        const commonPrefix = this.getCommonPrefix(currentKey, prefix);
        if (commonPrefix.length > 0) {
          matchingPrefix = prefix;
          matchingChild = child;
          break;
        }
      }

      if (matchingChild) {
        const commonPrefix = this.getCommonPrefix(currentKey, matchingPrefix);

        // Case 1: Exact match with existing prefix
        if (matchingPrefix === commonPrefix) {
          currentNode = matchingChild;
          currentKey = currentKey.slice(commonPrefix.length);
          continue;
        }

        // Case 2: Split the existing child
        const newChild: RadixNode<T> = {
          key: matchingPrefix.slice(commonPrefix.length),
          isEnd: matchingChild.isEnd,
          children: matchingChild.children,
          data: matchingChild.data
        };

        // Update existing child
        matchingChild.key = commonPrefix;
        matchingChild.isEnd = false;
        matchingChild.children = new Map<string, RadixNode<T>>();
        matchingChild.children.set(newChild.key, newChild);
        matchingChild.data = null;

        currentNode = matchingChild;
        currentKey = currentKey.slice(commonPrefix.length);
      } else {
        // Case 3: No matching child, create a new one
        const newNode: RadixNode<T> = {
          key: currentKey,
          isEnd: true,
          children: new Map<string, RadixNode<T>>(),
          data
        };
        currentNode.children.set(currentKey, newNode);
        return;
      }
    }

    // If we've consumed the entire key, mark current node as end
    currentNode.isEnd = true;
    currentNode.data = data;
  }

  /**
   * Find and return data associated with a key
   * @param key - The key to search for
   * @returns The associated data or null if not found
   */
  find(key: string): T | null {
    const node = this.findNode(key);
    return node && node.isEnd ? node.data : null;
  }

  /**
   * Find node by key
   * @param key - The key to search for
   * @returns The node or null if not found
   */
  private findNode(key: string): RadixNode<T> | null {
    let currentNode = this.root;
    let currentKey = key;

    while (currentKey.length > 0) {
      let matchFound = false;

      for (const [prefix, child] of currentNode.children.entries()) {
        if (currentKey.startsWith(prefix)) {
          currentNode = child;
          currentKey = currentKey.slice(prefix.length);
          matchFound = true;
          break;
        }
      }

      if (!matchFound) {
        return null;
      }
    }

    return currentNode;
  }

  /**
   * Get all keys that start with a given prefix
   * @param prefix - The prefix to search for
   * @returns Array of data items whose keys start with the prefix
   */
  findByPrefix(prefix: string): T[] {
    const results: T[] = [];
    const node = this.findClosestNode(prefix);

    if (!node) {
      return results;
    }

    if (node.isEnd) {
      results.push(node.data!);
    }

    this.collectChildren(node, results);
    return results;
  }

  /**
   * Find the closest node matching a prefix
   * @param prefix - The prefix to search for
   * @returns The closest matching node or null
   */
  private findClosestNode(prefix: string): RadixNode<T> | null {
    let currentNode = this.root;
    let currentPrefix = prefix;

    while (currentPrefix.length > 0) {
      let matchFound = false;

      for (const [nodePrefix, child] of currentNode.children.entries()) {
        if (currentPrefix.startsWith(nodePrefix)) {
          currentNode = child;
          currentPrefix = currentPrefix.slice(nodePrefix.length);
          matchFound = true;
          break;
        } else if (nodePrefix.startsWith(currentPrefix)) {
          return child;
        }
      }

      if (!matchFound) {
        return null;
      }
    }

    return currentNode;
  }

  /**
   * Recursively collect all data items from node and its children
   * @param node - The starting node
   * @param results - Array to collect the results
   */
  private collectChildren(node: RadixNode<T>, results: T[]): void {
    for (const child of node.children.values()) {
      if (child.isEnd) {
        results.push(child.data!);
      }
      this.collectChildren(child, results);
    }
  }

  /**
   * Delete a key from the tree
   * @param key - The key to delete
   * @returns true if the key was deleted, false otherwise
   */
  delete(key: string): boolean {
    return this.deleteRecursive(this.root, key, 0);
  }

  private deleteRecursive(
    node: RadixNode<T>,
    key: string,
    depth: number
  ): boolean {
    // If we've reached the end of the key
    if (depth === key.length) {
      // If this is not an end node, the key doesn't exist
      if (!node.isEnd) {
        return false;
      }

      // Mark as not end and remove data
      node.isEnd = false;
      node.data = null;

      // Return true if this node should be deleted (no children)
      return node.children.size === 0;
    }

    // Find the child that matches the next part of the key
    for (const [prefix, child] of node.children.entries()) {
      if (key.slice(depth).startsWith(prefix)) {
        // Recursively delete from child
        const shouldDeleteChild = this.deleteRecursive(
          child,
          key,
          depth + prefix.length
        );

        // If child should be deleted
        if (shouldDeleteChild) {
          node.children.delete(prefix);

          // Merge nodes if current has only one child and is not an end node
          if (node.children.size === 1 && !node.isEnd && node !== this.root) {
            const [remainingPrefix, remainingChild] = Array.from(
              node.children.entries()
            )[0];

            node.key = node.key + remainingPrefix;
            node.isEnd = remainingChild.isEnd;
            node.data = remainingChild.data;
            node.children = remainingChild.children;
          }
        }

        // The current node should be deleted if it has no children and is not an end node
        return !node.isEnd && node.children.size === 0;
      }
    }

    // Key not found
    return false;
  }

  /**
   * Get all keys and their associated data
   * @returns Array of [key, data] tuples
   */
  getAllEntries(): Array<[string, T]> {
    const results: Array<[string, T]> = [];
    this.collectEntries(this.root, '', results);
    return results;
  }

  private collectEntries(
    node: RadixNode<T>,
    currentKey: string,
    results: Array<[string, T]>
  ): void {
    if (node.isEnd) {
      results.push([currentKey, node.data!]);
    }

    for (const [prefix, child] of node.children.entries()) {
      this.collectEntries(child, currentKey + prefix, results);
    }
  }

  /**
   * Get the common prefix between two strings
   * @param a - First string
   * @param b - Second string
   * @returns The common prefix
   */
  private getCommonPrefix(a: string, b: string): string {
    let i = 0;
    const len = Math.min(a.length, b.length);

    while (i < len && a[i] === b[i]) {
      i++;
    }

    return a.substring(0, i);
  }

  /**
   * Get the total number of nodes in the tree
   * @returns Node count
   */
  getNodeCount(): number {
    let count = 1; // Start with root

    function countNodes(node: RadixNode<any>): void {
      count += node.children.size;
      for (const child of node.children.values()) {
        countNodes(child);
      }
    }

    countNodes(this.root);
    return count;
  }

  /**
   * Print the tree structure (for debugging)
   */
  printTree(): void {
    this.printNode(this.root, 0);
  }

  private printNode(node: RadixNode<T>, depth: number): void {
    const indent = '  '.repeat(depth * 2);
    const dataStr = node.isEnd ? ` .` : '';
    console.log(`${indent}${node.key}${dataStr}`);

    for (const child of node.children.values()) {
      this.printNode(child, depth + 1);
    }
  }

  public inOrderTraversal(fn: (node: T) => unknown): void {
    this.inOrderTraversalHelper(this.root, fn);
  }
  private inOrderTraversalHelper(
    node: RadixNode<T>,
    fn: (node: T) => unknown
  ): void {
    if (node.isEnd) {
      fn(node.data!);
    }
    for (const child of node.children.values()) {
      this.inOrderTraversalHelper(child, fn);
    }
  }

  private preOrderTraversalHelper(
    node: RadixNode<T>,
    fn: (node: T) => unknown
  ): void {
    fn(node.data!);
    for (const child of node.children.values()) {
      this.preOrderTraversalHelper(child, fn);
    }
  }
  public preOrderTraversal(fn: (node: T) => unknown): void {
    this.preOrderTraversalHelper(this.root, fn);
  }

  private postOrderTraversalHelper(
    node: RadixNode<T>,
    fn: (node: T) => unknown
  ): void {
    for (const child of node.children.values()) {
      this.postOrderTraversalHelper(child, fn);
    }
    fn(node.data!);
  }
  public postOrderTraversal(fn: (node: T) => unknown): void {
    this.postOrderTraversalHelper(this.root, fn);
  }
  public levelOrderTraversal(fn: (node: T) => unknown): void {
    const queue: RadixNode<T>[] = [this.root];

    while (queue.length > 0) {
      const node = queue.shift()!;
      if (node.isEnd) {
        fn(node.data!);
      }
      for (const child of node.children.values()) {
        queue.push(child);
      }
    }
  }
  public getRoot(): RadixNode<T> {
    return this.root;
  }
}

/**
 * Node interface for the RadixTree
 */
interface RadixNode<T> {
  key: string;
  isEnd: boolean;
  children: Map<string, RadixNode<T>>;
  data: T | null;
}
