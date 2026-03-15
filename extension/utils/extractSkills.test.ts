import { describe, it, expect } from 'vitest';
import { extractSkills } from './extractSkills';

describe('extractSkills', () => {
  it('returns empty array for empty input', () => {
    expect(extractSkills('')).toEqual([]);
  });

  it('returns empty array for null-ish input', () => {
    expect(extractSkills(undefined as unknown as string)).toEqual([]);
  });

  it('returns empty array when no skills match', () => {
    expect(extractSkills('We enjoy long walks on the beach')).toEqual([]);
  });

  it('extracts known skills from text', () => {
    const result = extractSkills('We use React and TypeScript daily');
    expect(result).toContain('React');
    expect(result).toContain('TypeScript');
  });

  it('matches case-insensitively', () => {
    const result = extractSkills('we love react and typescript');
    expect(result).toContain('React');
    expect(result).toContain('TypeScript');
  });

  it('returns unique list for duplicate mentions', () => {
    const result = extractSkills('React React React React');
    expect(result).toEqual(['React']);
  });

  it('returns results in KNOWN_SKILLS order, not input order', () => {
    // KNOWN_SKILLS order: JavaScript, TypeScript, Python
    const result = extractSkills('Python then TypeScript then JavaScript');
    const jsIdx = result.indexOf('JavaScript');
    const tsIdx = result.indexOf('TypeScript');
    const pyIdx = result.indexOf('Python');
    expect(jsIdx).toBeLessThan(tsIdx);
    expect(tsIdx).toBeLessThan(pyIdx);
  });

  it('caps results at 30 skills', () => {
    const manySkills = [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust',
      'Ruby', 'PHP', 'Swift', 'Kotlin', 'Scala', 'Perl', 'Dart', 'Elixir',
      'Haskell', 'Lua', 'SQL', 'React', 'Angular', 'Vue', 'Svelte',
      'Nuxt', 'Remix', 'HTML', 'CSS', 'Tailwind', 'Sass', 'Redux', 'MobX',
      'Zustand', 'Deno', 'Bun', 'Express', 'Django', 'Flask',
    ];
    const text = manySkills.join(' ');
    const result = extractSkills(text);
    expect(result).toHaveLength(30);
  });

  it('does not match partial words', () => {
    const result = extractSkills('Reactive programming is great');
    expect(result).not.toContain('React');
  });

  describe('skills with dots', () => {
    it('matches Node.js', () => {
      const result = extractSkills('Backend built with Node.js');
      expect(result).toContain('Node.js');
    });

    it('matches Next.js', () => {
      const result = extractSkills('Frontend uses Next.js for SSR');
      expect(result).toContain('Next.js');
    });

    it('matches ASP.NET', () => {
      const result = extractSkills('Built on ASP.NET Core');
      expect(result).toContain('ASP.NET');
    });
  });

  it('matches CI/CD', () => {
    const result = extractSkills('Strong CI/CD pipeline experience');
    expect(result).toContain('CI/CD');
  });

  describe('skills with non-word boundary characters', () => {
    it('matches C++', () => {
      const result = extractSkills('Experience with C++ required');
      expect(result).toContain('C++');
    });

    it('matches C#', () => {
      const result = extractSkills('Must know C# and stuff');
      expect(result).toContain('C#');
    });

    it('matches standalone .NET', () => {
      const result = extractSkills('Our stack is .NET and Azure');
      expect(result).toContain('.NET');
    });

    it('matches C++ at start of text', () => {
      const result = extractSkills('C++ is required');
      expect(result).toContain('C++');
    });

    it('matches .NET at end of text', () => {
      const result = extractSkills('We use .NET');
      expect(result).toContain('.NET');
    });
  });
});
