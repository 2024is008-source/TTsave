declare module 'node:http' {
  interface IncomingMessage {
    id: string;
  }
}

export {};
