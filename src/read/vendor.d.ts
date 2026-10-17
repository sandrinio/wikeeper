// Ambient types for libraries that ship none (STORY-003-11): only the parts `read` uses.
declare module "turndown" {
  interface Options {
    headingStyle?: "setext" | "atx";
    bulletListMarker?: "-" | "+" | "*";
    codeBlockStyle?: "indented" | "fenced";
    emDelimiter?: "_" | "*";
    hr?: string;
  }
  interface Rule {
    filter: string | string[] | ((node: HTMLElement, options: Options) => boolean);
    replacement(content: string, node: HTMLElement, options: Options): string;
  }
  class TurndownService {
    constructor(options?: Options);
    use(plugin: (service: TurndownService) => void): this;
    addRule(key: string, rule: Rule): this;
    turndown(input: string): string;
  }
  export default TurndownService;
}

declare module "@joplin/turndown-plugin-gfm" {
  import type TurndownService from "turndown";
  export function gfm(service: TurndownService): void;
}
