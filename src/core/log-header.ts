// log.md header builder — i18n-aware pure function.
// Called by wiki-engine.ts when a new log.md is created.
// The header explains the log file and points to the Operation History Panel
// for better visualisation.

const HEADER_LABELS: Record<string, { title: string; subtitle: string; shortcut: string; settingsShortcut: string }> = {
  en: {
    title: 'Wiki Operation Log',
    subtitle: 'Every ingest, lint run, and maintenance operation is recorded here automatically. For a better experience, use the **Operation History** panel:',
    shortcut: 'Cmd+P → "View operation history"',
    settingsShortcut: 'Or open from Settings → Auto Maintenance → Operation History',
  },
  zh: {
    title: 'Wiki 操作日志',
    subtitle: '每次摄入、Lint 运行和维护操作都会自动记录在这里。推荐使用**操作历史**面板获得更好的可视化呈现：',
    shortcut: 'Cmd+P → "查看操作历史"',
    settingsShortcut: '或从 设置 → 自动维护 → 操作历史 进入',
  },
  'zh-Hant': {
    title: 'Wiki 操作日誌',
    subtitle: '每次攝入、Lint 運行和維護操作都會自動記錄在這裡。推薦使用**操作歷史**面板獲得更好的可視化呈現：',
    shortcut: 'Cmd+P → "檢視操作歷史"',
    settingsShortcut: '或從 設定 → 自動維護 → 操作歷史 進入',
  },
  ja: {
    title: 'Wiki 操作ログ',
    subtitle: '取り込み、Lint実行、メンテナンス操作はすべてここに自動記録されます。より良い表示には**操作履歴**パネルをご利用ください：',
    shortcut: 'Cmd+P → "操作履歴を表示"',
    settingsShortcut: 'または 設定 → 自動メンテナンス → 操作履歴 から',
  },
  ko: {
    title: 'Wiki 작업 기록',
    subtitle: '모든 수집, Lint 실행 및 유지보수 작업이 여기에 자동 기록됩니다. 더 나은 보기를 위해 **작업 기록** 패널을 사용하세요:',
    shortcut: 'Cmd+P → "작업 기록 보기"',
    settingsShortcut: '또는 설정 → 자동 유지보수 → 작업 기록에서',
  },
  de: {
    title: 'Wiki Betriebsprotokoll',
    subtitle: 'Jede Aufnahme, Lint-Ausführung und Wartungsoperation wird hier automatisch aufgezeichnet. Für eine bessere Ansicht nutzen Sie das **Betriebsverlauf**-Panel:',
    shortcut: 'Cmd+P → "Betriebsverlauf anzeigen"',
    settingsShortcut: 'Oder über Einstellungen → Automatische Wartung → Betriebsverlauf',
  },
  fr: {
    title: 'Wiki Journal des opérations',
    subtitle: 'Chaque ingestion, exécution de lint et opération de maintenance est enregistrée ici automatiquement. Pour une meilleure visualisation, utilisez le panneau **Historique des opérations** :',
    shortcut: 'Cmd+P → "Afficher l\'historique des opérations"',
    settingsShortcut: 'Ou via Paramètres → Maintenance automatique → Historique des opérations',
  },
  es: {
    title: 'Wiki Registro de operaciones',
    subtitle: 'Cada ingesta, ejecución de lint y operación de mantenimiento se registra aquí automáticamente. Para una mejor visualización, usa el panel **Historial de operaciones**:',
    shortcut: 'Cmd+P → "Ver historial de operaciones"',
    settingsShortcut: 'O desde Ajustes → Mantenimiento automático → Historial de operaciones',
  },
  pt: {
    title: 'Wiki Registro de operações',
    subtitle: 'Cada ingestão, execução de lint e operação de manutenção é registrada aqui automaticamente. Para uma melhor visualização, use o painel **Histórico de operações**:',
    shortcut: 'Cmd+P → "Ver histórico de operações"',
    settingsShortcut: 'Ou em Configurações → Manutenção automática → Histórico de operações',
  },
  it: {
    title: 'Wiki Registro operazioni',
    subtitle: 'Ogni acquisizione, esecuzione lint e operazione di manutenzione viene registrata qui automaticamente. Per una migliore visualizzazione, usa il pannello **Cronologia operazioni**:',
    shortcut: 'Cmd+P → "Visualizza cronologia operazioni"',
    settingsShortcut: 'Oppure da Impostazioni → Manutenzione automatica → Cronologia operazioni',
  },
};

export function buildLogHeader(lang: string): string {
  const labels = HEADER_LABELS[lang] || HEADER_LABELS.en;
  return `# ${labels.title}

${labels.subtitle}
- ${labels.shortcut}
- ${labels.settingsShortcut}

---
`;
}

// v1.22.2: log header old-format detection and non-destructive migration.
// v1.22.1 and earlier wrote a one-line header like:
//   "# Wiki Operation Log\n\n"
// New format is multi-line with History Panel hints (see HEADER_LABELS).
// On startup, scan log.md and replace ONLY the header — all `## [date time]`
// entries are preserved untouched. Idempotent on already-migrated files.

/** True if the given log content has the legacy single-line header for the
 *  given language (and not the multi-line new format). */
export function isOldFormatLogHeader(content: string | null, lang: string): boolean {
  if (!content) return false;
  // Extract the first H1 line and the first non-empty line following it.
  const lines = content.split('\n');
  const h1 = lines.find(l => l.startsWith('# '));
  if (!h1) return false;
  // The new format has a "View operation history" or equivalent hint line
  // within the first ~6 lines after the H1.
  const headWindow = lines.slice(0, 12).join('\n').toLowerCase();
  if (lang === 'zh' || lang === 'zh-Hant') {
    if (headWindow.includes('查看操作历史') || headWindow.includes('檢視操作歷史') || headWindow.includes('操作历史')) return false;
    if (headWindow.includes('view operation history')) return false;
  } else {
    // New format: contains "View operation history" or equivalent in head window
    if (headWindow.includes('view operation history')) return false;
  }
  // Old format: only H1 + immediate blank line + content
  return true;
}

/** Decide whether migration is needed: file present AND old format. */
export function needsLogHeaderMigration(content: string | null, lang: string): boolean {
  if (!content) return false;
  return isOldFormatLogHeader(content, lang);
}

/** Non-destructive migration: replace the legacy single-line H1 with the
 *  new multi-line header from buildLogHeader, preserving all subsequent
 *  ## [date time] entries. Idempotent on already-migrated content. */
export function migrateLogHeader(content: string | null, lang: string): string | null {
  if (!content) return content;
  if (!needsLogHeaderMigration(content, lang)) return content;
  // The H1 is the first line. Drop it + the immediate blank line (if any),
  // then prepend the new header.
  const lines = content.split('\n');
  let cutIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('# ')) { cutIdx = i; break; }
  }
  // Skip the H1 line and any blank lines immediately following
  while (cutIdx + 1 < lines.length && lines[cutIdx + 1].trim() === '') {
    cutIdx++;
  }
  cutIdx++; // cut AFTER the trailing blank line
  const tail = lines.slice(cutIdx).join('\n');
  const newHeader = buildLogHeader(lang);
  return newHeader + tail;
}
