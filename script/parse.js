const { parse } = require("node-html-parser");
const fs = require("fs");
const path = require("path");
const { Parser } = require("htmlparser2");
const { DomHandler } = require("domhandler");
const { findAll, findOne, getInnerHTML, getText } = require("domutils");

function tree(docs) {
  const map = { id: 0 };
  docs.forEach(doc => {
    const [chapter, part] = doc.name.split(".");
    const path = [chapter];
    if (part) {
      const split = part.split("");
      let id = "";
      while (split.length !== 0) {
        const p = split.shift();
        if (id.length === 0 && p === "0") continue;
        id += p;
        path.push(id.toString());
        id = "";
      }
    }
    let curr = map;
    while (path.length !== 0) {
      const p = path.shift();
      curr[p] = curr[p] || {};
      curr = curr[p];
    }
    if (!curr.href) curr.href = doc.href;
  });
  const Q = [map];
  const readqueue = [];
  while (Q.length !== 0) {
    const curr = Q.pop();
    if (typeof curr !== "object") continue;
    const children = [];
    Object.keys(curr).forEach(key => {
      if (key !== "href") {
        const child = curr[key];
        children.push(child);
        Q.push(child);
        delete curr[key];
      }
    });
    if (children.length !== 0) {
      curr.children = children;
    }
    if (!curr.id && curr.href) {
      const match = curr.href.match(/\d+/);
      if (match) {
        curr.id = match[0];
        readqueue.push({
          node: curr,
          href: path.join(process.cwd(), "data", curr.href)
        });
      }
    }
  }

  function read() {
    if (readqueue.length > 0) {
      const { href, node } = readqueue.pop();
      fs.readFile(href, "utf8", (err, content) => {
        const contentHandler = new DomHandler((err, dom) => {
          const head = findOne(el => el.tagName === "dt", dom);
          const body = findOne(el => el.tagName === "dd", dom);

          if (head && body) {
            node.name = getInnerHTML(head).match(/\d(\.\d+)?/)[0];
            node.content = getInnerHTML(body).replace(/<\/?b>/, "").trim();
          }
        });
        const parser = new Parser(contentHandler);
        parser.write(content);
        parser.end();
        read();
      });
    } else {
      const Q = [map];
      while (Q.length !== 0) {
        const curr = Q.pop();
        if (curr.children) {
          for (let i = 0; i < curr.children.length; i++) {
            const c = curr.children[i];
            if (c.id === undefined) {
              curr.children.splice(i--, 1);
            } else Q.push(c);
          }
        }
      }
      fs.writeFileSync(
        path.join(process.cwd(), "data", "data.json"),
        JSON.stringify(map)
      );
    }
  }
  read();
}

const tocContent = fs.readFileSync(
  path.join(process.cwd(), "data", "mapen.html"),
  "utf8"
);
const handler = new DomHandler((err, dom) => {
  const docs = findAll(
    e => e.tagName === "a" && e.attribs.href,
    dom
  ).map(a => ({ name: a.children[0].data, href: a.attribs.href }));
  tree(docs);
});
const parser = new Parser(handler);
parser.write(tocContent);
parser.end();
