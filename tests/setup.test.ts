import { describe, it, expect } from 'vitest';
import { VERSION } from '../src/index.js';

describe('project setup', () => {
  it('should export VERSION', () => {
    expect(VERSION).toBe('2.1.0');
  });
});
