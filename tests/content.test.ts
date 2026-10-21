import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module
import { validate } from '../scripts/validate-questions.mjs';

describe('content', () => {
  it('question banks and UI strings are valid for every language', () => {
    const { errors, langs } = validate();
    expect(errors).toEqual([]);
    expect(langs).toEqual(expect.arrayContaining(['sv', 'en']));
  });
});
