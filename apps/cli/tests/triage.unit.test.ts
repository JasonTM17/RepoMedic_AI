import { describe, it, expect } from 'vitest';
import { createProgram } from '../src/index.js';

describe('CLI triage command', () => {
  it('triage command is registered', () => {
    const program = createProgram();
    const commands = program.commands.map(c => c.name());
    expect(commands).toContain('triage');
  });

  it('triage command has --dry-run option', () => {
    const program = createProgram();
    const triage = program.commands.find(c => c.name() === 'triage');
    expect(triage).toBeDefined();
    const opts = triage?.options.map(o => o.long);
    expect(opts).toContain('--dry-run');
  });

  it('triage command has --model option', () => {
    const program = createProgram();
    const triage = program.commands.find(c => c.name() === 'triage');
    const opts = triage?.options.map(o => o.long);
    expect(opts).toContain('--model');
  });
});
