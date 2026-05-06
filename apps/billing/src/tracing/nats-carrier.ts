import { headers, type MsgHdrs } from 'nats';

export class NatsHeadersCarrier {
  public constructor(private readonly hdrs: MsgHdrs) {}

  public get(key: string): string | undefined {
    return this.hdrs.get(key) ?? undefined;
  }

  public set(key: string, value: string): void {
    this.hdrs.set(key, value);
  }

  public keys(): string[] {
    const keys: string[] = [];
    for (const [key] of this.hdrs) {
      keys.push(key);
    }
    return keys;
  }
}

export const createHeaders = (): MsgHdrs => headers();
