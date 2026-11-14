import type { Nodes, PhrasingContent, Root } from 'mdast';

declare module 'mdast' {
  interface PhrasingContentMap {
    citation: {
      type: 'citation';
      data: {
        hName: 'span';
        hProperties: { dataCitation: string };
        hChildren: { type: 'text'; value: string }[];
      };
    };
  }
}

// TRD §15.5: only text nodes are split; code nodes remain untouched.
export function remarkCitations() {
  return (tree: Root) => {
    function walk(node: Nodes | PhrasingContent): void {
      if (!('children' in node)) return;
      for (let index = 0; index < node.children.length; index++) {
        const child = node.children[index];
        if (!child) continue;
        if (child.type !== 'text') {
          walk(child);
          continue;
        }
        const parts: PhrasingContent[] = [];
        let offset = 0;
        for (const match of child.value.matchAll(/\[P([1-9])\]/g)) {
          if (match.index > offset)
            parts.push({ type: 'text', value: child.value.slice(offset, match.index) });
          const label = `P${match[1] ?? ''}`;
          parts.push({
            type: 'citation',
            data: {
              hName: 'span',
              hProperties: { dataCitation: label },
              hChildren: [{ type: 'text', value: label }],
            },
          });
          offset = match.index + match[0].length;
        }
        if (parts.length === 0) continue;
        if (offset < child.value.length)
          parts.push({ type: 'text', value: child.value.slice(offset) });
        node.children.splice(index, 1, ...parts);
        index += parts.length - 1;
      }
    }
    walk(tree);
  };
}
