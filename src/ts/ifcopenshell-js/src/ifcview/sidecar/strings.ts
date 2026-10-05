export class SidecarStringTable {
  private readonly chunks: string[] = [];
  private length = 0;

  add(value: string): { offset: number; length: number } {
    if (!value) {
      return { offset: 0, length: 0 };
    }

    const existing = this.chunks.join("").indexOf(value);
    if (existing >= 0) {
      return { offset: existing, length: value.length };
    }

    const offset = this.length;
    this.chunks.push(value);
    this.length += value.length;
    return { offset, length: value.length };
  }

  toString(): string {
    return this.chunks.join("");
  }
}
