declare module 'node:fs/promises' {
  export function readFile(path: string): Promise<Uint8Array>;
  export function readFile(path: string, encoding: 'utf8'): Promise<string>;
  export function readdir(path: string): Promise<string[]>;
}

declare module 'node:path' {
  interface PathApi {
    readonly sep: string;
    join(...paths: string[]): string;
    resolve(...paths: string[]): string;
  }

  const path: PathApi;
  export default path;
}

declare const process: {
  cwd(): string;
};
