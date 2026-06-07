declare module 'joplin-turndown-plugin-gfm' {
  import type TurndownService from 'turndown';

  export function gfm(turndownService: TurndownService): void;
}
