// v1.22.2: log.md old-format auto-migration
// Pure-function logic: detect old-format header, replace with new format
// while preserving all existing ## [date time] entries.
import { describe, it, expect } from 'vitest';
import { needsLogHeaderMigration, migrateLogHeader, isOldFormatLogHeader } from '../../core/log-header';

describe('log.md header migration (v1.22.2 — non-destructive for existing wikis)', () => {
  it('detects old-format English header', () => {
    const old = '# Wiki Operation Log\n\n';
    expect(isOldFormatLogHeader(old, 'en')).toBe(true);
  });

  it('detects old-format Chinese header (legacy plain header)', () => {
    const old = '# Wiki 操作日志\n\n';
    expect(isOldFormatLogHeader(old, 'zh')).toBe(true);
  });

  it('does NOT flag new-format header (already migrated)', () => {
    // New format has the Operation History hint line within the first 12 lines
    const newer = '# Wiki Operation Log\n\nSome new content with shortcut hint\n- Cmd+P → "View operation history"\n---\n';
    expect(isOldFormatLogHeader(newer, 'en')).toBe(false);
  });

  it('does NOT flag content without H1 header at all', () => {
    const noHeader = 'just some text without a header\n';
    expect(isOldFormatLogHeader(noHeader, 'en')).toBe(false);
  });

  it('needsLogHeaderMigration returns true for old format, false otherwise', () => {
    expect(needsLogHeaderMigration('# Wiki Operation Log\n\n', 'en')).toBe(true);
    expect(needsLogHeaderMigration('# Wiki Operation Log\n\n- Cmd+P → "View operation history"\n---\n', 'en')).toBe(false);
    expect(needsLogHeaderMigration('', 'en')).toBe(false);
    expect(needsLogHeaderMigration(null, 'en')).toBe(false);
  });

  it('migrateLogHeader replaces old header while preserving all entries', () => {
    const old = [
      '# Wiki Operation Log',
      '',
      '## [2026-06-15 10:00] Ingest | notes.md',
      '',
      '**Created pages**: 5',
      '',
      '## [2026-06-16 11:30] Lint | full',
      '',
      'Some lint details',
      '',
    ].join('\n');
    const migrated = migrateLogHeader(old, 'en');
    // New format contains Operation History hint
    expect(migrated).toMatch(/View operation history/);
    // Old entries preserved
    expect(migrated).toMatch(/## \[2026-06-15 10:00\] Ingest \| notes\.md/);
    expect(migrated).toMatch(/## \[2026-06-16 11:30\] Lint \| full/);
    expect(migrated).toMatch(/\*\*Created pages\*\*: 5/);
    expect(migrated).toMatch(/Some lint details/);
  });

  it('migrateLogHeader is idempotent on new-format content', () => {
    const newer = '# Wiki Operation Log\n\nSome new content with shortcut hint\n---\n\n## [2026-06-15] entry\n';
    const migrated = migrateLogHeader(newer, 'en')!;
    // Should not duplicate the new header
    expect(migrated.match(/View operation history/g)?.length).toBe(1);
  });

  it('migrateLogHeader handles edge case: file with just header and no entries', () => {
    const onlyHeader = '# Wiki Operation Log\n\n';
    const migrated = migrateLogHeader(onlyHeader, 'en');
    expect(migrated).toMatch(/View operation history/);
    expect(migrated).toMatch(/# Wiki Operation Log/);
  });

  it('migrateLogHeader is a no-op on empty/null input', () => {
    expect(migrateLogHeader('', 'en')).toBe('');
    expect(migrateLogHeader(null, 'en')).toBe(null);
  });
});
