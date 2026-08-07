export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x1_0000_0000;
  }

  hitBps(bps: number): boolean {
    if (bps <= 0) return false;
    if (bps >= 10_000) return true;
    return this.next() < bps / 10_000;
  }

  nextInt(maximumExclusive: number): number {
    if (!Number.isSafeInteger(maximumExclusive) || maximumExclusive <= 0) {
      throw new RangeError('maximumExclusive must be a positive safe integer');
    }
    return Math.floor(this.next() * maximumExclusive);
  }
}
