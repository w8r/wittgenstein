declare module "tex-linebreak" {
  type measurer = (str: string) => number;
  interface Item {
    text: string;
  }
  interface Breakpoint {}
  interface PositionedItem {
    item: number;
    line: number;
  }
  export function layoutItemsFromString(str: string, measure: measurer): Item[];
  export function breakLines(items: Item[], max: number): Breakpoint[];
  export function positionItems(
    items: Item[],
    max: number,
    breakpoints: Breakpoint[]
  ): PositionedItem[];
}
