export interface Question {
  id: string;
  cat: string;
  q: string;
  /** a[0] is always the correct answer. */
  a: [string, string];
}

export interface QuestionBank {
  version: number;
  lang: string;
  questions: Question[];
}

/** An asked question with the answers in display order. */
export interface AskedQuestion {
  question: Question;
  /** options[i] is the index into question.a shown at position i. */
  options: [number, number];
}

/**
 * Hands out questions in random order without repeats until the bank is used up.
 * `seen` is persisted by the caller so repeats are avoided across sessions too.
 */
export class QuestionDeck {
  private pool: Question[] = [];

  constructor(
    private bank: Question[],
    private seen: Set<string> = new Set(),
    private rng: () => number = Math.random,
  ) {
    this.refill();
  }

  private refill() {
    let fresh = this.bank.filter((q) => !this.seen.has(q.id));
    if (fresh.length === 0) {
      this.seen.clear();
      fresh = [...this.bank];
    }
    for (let i = fresh.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
    }
    this.pool = fresh;
  }

  get seenIds(): string[] {
    return [...this.seen];
  }

  next(): AskedQuestion | null {
    if (this.bank.length === 0) return null;
    if (this.pool.length === 0) this.refill();
    const question = this.pool.pop()!;
    this.seen.add(question.id);
    const options: [number, number] = this.rng() < 0.5 ? [0, 1] : [1, 0];
    return { question, options };
  }
}
