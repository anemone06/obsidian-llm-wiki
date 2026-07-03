// Schema Manager - Wiki Schema configuration layer (Karpathy's third layer)

import { App, TFile } from 'obsidian';
import { LLMWikiSettings, WikiSchema, SchemaSuggestion, VALID_ENTITY_TAGS, VALID_CONCEPT_TAGS, DEFAULT_ENTITY_TAG, DEFAULT_CONCEPT_TAG, LLMClient, WIKI_LANGUAGES } from '../types';
import { PROMPTS } from '../prompts';
import { parseSchemaSuggestion } from './parse-suggestion';
import { getActiveEntityTags, getActiveConceptTags } from '../core/tag-vocab';
import { capMaxTokens } from '../core/token-cap';
import { TOKENS_SCHEMA_SUGGESTION } from '../constants';

const SCHEMA_FILENAME = 'schema/config.md';
const SUGGESTIONS_FILENAME = 'schema/suggestions.md';

export type SchemaTask = 'analyze' | 'summary' | 'entity' | 'concept' | 'related' | 'conversation' | 'index' | 'lint' | 'merge' | 'full';

// Re-export tag constants from types.ts for convenience
export { VALID_ENTITY_TAGS, VALID_CONCEPT_TAGS, DEFAULT_ENTITY_TAG, DEFAULT_CONCEPT_TAG };

const TASK_SECTIONS: Record<SchemaTask, string[]> = {
  analyze: ['Wiki 结构', '分类规则', '命名规范'],
  summary: ['Wiki 结构', '分类规则'],
  entity: ['实体页面模板', '命名规范', '分类规则'],
  concept: ['概念页面模板', '命名规范', '分类规则'],
  related: ['命名规范', '分类规则'],
  conversation: ['Wiki 结构', '实体页面模板', '概念页面模板', '命名规范', '分类规则'],
  index: ['Wiki 结构'],
  lint: ['维护策略'],
  merge: ['实体页面模板', '概念页面模板', '命名规范', '分类规则'],
  full: ['Wiki 结构', '实体页面模板', '概念页面模板', '命名规范', '分类规则', '维护策略'],
};

export function buildDefaultSchemaBody(settings?: LLMWikiSettings): string {
  // v1.22.0 Phase 2: dynamic tag vocabulary. When settings are provided and
  // tagVocabularyMode === 'custom', the active tag list comes from
  // getActiveEntityTags / getActiveConceptTags — keeping the schema body
  // and the prompt's Active Tag Vocabulary section in lockstep, so the LLM
  // never sees two conflicting tag lists. When settings are undefined
  // (first-ever load, before any settings are persisted), we fall back to
  // the hardcoded defaults — preserving the original public-API behavior.
  const entityTags = settings ? getActiveEntityTags(settings) : [...VALID_ENTITY_TAGS];
  const conceptTags = settings ? getActiveConceptTags(settings) : [...VALID_CONCEPT_TAGS];
  const entityList = entityTags.join(', ');
  const conceptList = conceptTags.join(', ');
  return `# Wiki Schema 配置

这个文件控制 LLM 如何创建和维护你的 Wiki。你可以按自己的工作流自由编辑。

## Wiki 结构
- 实体页面：\`entities/\`（${entityList}）
- 概念页面：\`concepts/\`（${conceptList}）
- 来源页面：\`sources/\`
- 索引：\`index.md\`
- 日志：\`log.md\`

## 实体页面模板
\`entities/\` 中的页面必须遵循以下结构：

**Frontmatter 字段：**
- \`type: entity\` — 页面类别，必须精确为 "entity"
- \`created:\` — 首次创建日期，使用 ISO 格式
- \`sources:\` — 来源文件 wiki-link 数组
- \`tags:\` — 实体子类型，必须是以下之一：${entityList}
- \`aliases:\`（可选）— 其他名称，例如翻译、简称、缩写
- \`reviewed:\`（可选）— 若为 true，表示页面已由人工确认并受到保护

**章节：**
1. **基础信息**：类型、来源文件链接
2. **描述**：3-6 句具体事实说明，并包含双向链接
3. **相关实体**：使用 [[entities/...]] 链接到相关实体
4. **相关概念**：使用 [[concepts/...]] 链接到相关概念
5. **原文提及**：带来源归属的原文引用，见下方[原文提及格式](#原文提及格式)

## 概念页面模板
\`concepts/\` 中的页面必须遵循以下结构：

**Frontmatter 字段：**
- \`type: concept\` — 页面类别，必须精确为 "concept"
- \`created:\` — 首次创建日期，使用 ISO 格式
- \`sources:\` — 来源文件 wiki-link 数组
- \`tags:\` — 概念子类型，必须是以下之一：${conceptList}
- \`aliases:\`（可选）— 其他名称，例如翻译、简称、缩写
- \`reviewed:\`（可选）— 若为 true，表示页面已由人工确认并受到保护

**章节：**
1. **定义**：清晰、简洁的定义
2. **关键特征**：用列表说明决定性特征
3. **应用场景**：真实使用场景
4. **相关概念**：使用 [[concepts/...]] 链接
5. **相关实体**：使用 [[entities/...]] 链接
6. **原文提及**：带来源归属的原文引用，见下方[原文提及格式](#原文提及格式)

## 命名规范
- 文件名：使用 slug 格式，默认小写并用连字符连接
- 实体/概念名称：保留源文件中的原始语言，不要翻译名称本身
- Wiki 链接：使用完整路径，例如 [[entities/page-name|Display Name]] 或 [[concepts/page-name|Display Name]]

## 来源页面模板
\`sources/\` 中的页面必须遵循以下结构：

**Frontmatter 字段：**
- \`type: source\` — 页面类别，必须精确为 "source"
- \`tags:\` — 继承自源笔记 frontmatter，不要使用 LLM 提取出的概念名。系统会从源文件自动填充该字段，LLM 不得用抽取概念覆盖它。这样可以保留用户已有标签词表，并避免 LLM 幻觉污染标签。
- \`sources:\` — 从该来源创建的相关 Wiki 页面链接数组
- \`created:\` / \`updated:\` — 由系统设置，见下方日期字段

**章节：**
1. **摘要**：对来源内容做简要说明（2-4 句）
2. **关键要点**：用列表列出主要洞察
3. **提及页面**：列出由该来源创建的 [[entities/...]] 和 [[concepts/...]] 页面

## 日期字段
- \`created:\` 和 \`updated:\` 由系统自动填写，绝不由 LLM 生成
- LLM 在抽取时可能生成错误日期；系统会在写入后覆盖它们以保证正确
- 合并页面时保留较早的 \`created:\`；\`updated:\` 始终设置为当前日期
- \`source_note:\`（可选）— 指向原始源文件的 wiki-link

## 原文提及格式
“原文提及”条目使用类似学术脚注的来源归属格式：
- "原始语言中的逐字引用（可选翻译）" — [[source-name|display-name]]

规则：
- 引用必须逐字保留，不要改写、概括或用翻译替代原文
- 必须包含来源 wiki-link，方便后续合并页面时追溯每条引用
- 来自同一来源的多条引用放在同一块中，并用换行分隔

## 内容规则
- \`mentions_in_source\` 必须是逐字引用，不要改写或翻译
- 摘要和描述应使用 Wiki 输出语言
- 实体/概念名称必须与源文件中的原始语言完全一致
- 所有页面都应在相关位置加入双向链接

## 分类规则
- **type 字段：** entity | concept | source — 页面类别
- **tags 字段：** 存储子类型（entity_type 或 concept_type）
- 实体子类型（type=entity 的合法 tags）：${entityList}
- 概念子类型（type=concept 的合法 tags）：${conceptList}
- 来源类型：document, conversation, note
- **规则：** tags 只能包含上方对应子类型列表中的值。不在合法列表里的 tag 会被系统移除。

## 多来源合并规则
- Sources 数组：追加新来源，绝不覆盖旧来源
- Aliases：追加其他名称（翻译、简称、缩写），不要覆盖已有别名
- reviewed 标记：若为 true，保留所有已有内容，只追加确实新增的信息
- 矛盾：保留双方说法并标注来源，加入 ## 矛盾 区块
- NO_NEW_CONTENT：如果来源没有带来新内容，返回该信号

## 维护策略
- 过期阈值：90 天没有更新
- 矛盾严重度：warning, conflict, error
- 孤立页面：没有其他 Wiki 页面链接到它
- 缺失页面：被 [[link]] 引用但实际不存在
`;
}

export class SchemaManager {
  private app: App;
  private settings: LLMWikiSettings;
  private getLLMClient: () => LLMClient | null;
  private cachedBody: string | null = null;
  private cacheValid = false;

  constructor(
    app: App,
    settings: LLMWikiSettings,
    getLLMClient: () => LLMClient | null
  ) {
    this.app = app;
    this.settings = settings;
    this.getLLMClient = getLLMClient;
  }

  private get client() {
    const c = this.getLLMClient();
    if (!c) throw new Error('LLM Client not initialized');
    return c;
  }

  private getSchemaPath(): string {
    return `${this.settings.wikiFolder}/${SCHEMA_FILENAME}`;
  }

  private getSuggestionsPath(): string {
    return `${this.settings.wikiFolder}/${SUGGESTIONS_FILENAME}`;
  }

  invalidateCache(): void {
    this.cacheValid = false;
    this.cachedBody = null;
  }

  updateSettings(settings: LLMWikiSettings): void {
    this.settings = settings;
    this.invalidateCache();
  }

  async getSchemaContext(task: SchemaTask = 'full'): Promise<string> {

    const schema = await this.loadSchema();
    if (!schema || !schema.body.trim()) return '';

    const body = schema.body.trim();
    const selectedBody = this.selectSections(body, task);

    if (!selectedBody.trim()) return '';

    return `你正在使用以下 Wiki Schema 配置。
创建、更新或分析 Wiki 页面时，请遵循这些规则。

--- SCHEMA 开始 ---
${selectedBody}
--- SCHEMA 结束 ---`;
  }

  private selectSections(body: string, task: SchemaTask): string {
    if (task === 'full') return body;

    const wanted = TASK_SECTIONS[task];
    const sections = this.parseSections(body);

    const selected = sections.filter(s => wanted.includes(s.heading));
    return selected.map(s => `## ${s.heading}\n${s.content}`).join('\n\n');
  }

  private parseSections(body: string): Array<{ heading: string; content: string }> {
    const result: Array<{ heading: string; content: string }> = [];
    const lines = body.split('\n');
    let currentHeading = '';
    let currentContent: string[] = [];

    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (currentHeading) {
          result.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
        }
        currentHeading = line.substring(3).trim();
        currentContent = [];
      } else if (currentHeading) {
        currentContent.push(line);
      }
    }
    if (currentHeading) {
      result.push({ heading: currentHeading, content: currentContent.join('\n').trim() });
    }

    return result;
  }

  async loadSchema(): Promise<WikiSchema | null> {
    if (this.cacheValid && this.cachedBody !== null) {
      return { version: 0, updated: '', auto_suggestion_count: 0, body: this.cachedBody };
    }

    const path = this.getSchemaPath();
    const file = this.app.vault.getAbstractFileByPath(path);

    if (!(file instanceof TFile)) return null;

    try {
      const content = await this.app.vault.read(file);
      const parsed = this.parseConfigFile(content);

      this.cachedBody = parsed.body;
      this.cacheValid = true;

      return parsed;
    } catch {
      console.warn('Failed to read schema file, ignoring');
      return null;
    }
  }

  async ensureSchemaExists(): Promise<void> {

    const path = this.getSchemaPath();
    const existing = this.app.vault.getAbstractFileByPath(path);

    if (existing instanceof TFile) return;

    // Ensure schema folder exists
    const schemaFolder = `${this.settings.wikiFolder}/schema`;
    try {
      await this.app.vault.createFolder(schemaFolder);
    } catch {
      // Already exists
    }

    const today = new Date().toISOString().slice(0, 10);
    const body = buildDefaultSchemaBody(this.settings);
    const content = `---
version: 1
updated: ${today}
auto_suggestion_count: 0
---

${body}`;

    await this.app.vault.create(path, content);
    this.cachedBody = body;
    this.cacheValid = true;

    console.debug('Created default schema at:', path);
  }

  async regenerateDefaultSchema(): Promise<void> {
    const path = this.getSchemaPath();
    const today = new Date().toISOString().slice(0, 10);
    const body = buildDefaultSchemaBody(this.settings);
    const content = `---
version: 1
updated: ${today}
auto_suggestion_count: 0
---

${body}`;

    // Ensure parent folders exist (handles empty vault or custom wikiFolder)
    const schemaFolder = `${this.settings.wikiFolder}/schema`;
    try {
      await this.app.vault.createFolder(schemaFolder);
    } catch {
      // Already exists or path invalid
    }

    const existing = this.app.vault.getAbstractFileByPath(path);

    if (existing instanceof TFile) {
      await this.app.vault.process(existing, () => content);
    } else {
      await this.app.vault.create(path, content);
    }

    this.cachedBody = body;
    this.cacheValid = true;

    console.debug('Regenerated default schema at:', path);
  }

  async suggestSchemaUpdate(context: string): Promise<SchemaSuggestion | null> {
    const schema = await this.loadSchema();
    const schemaContent = schema?.body || '(No schema configured yet)';

    // v1.22.0 #97: inject the user's UI language so the LLM writes the
    // "suggestions" field in the user's preferred language. WIKI_LANGUAGES
    // is the source of truth — it covers all 10 locales (en, zh, ja, ko,
    // de, fr, es, pt, it, zh-Hant) and returns the language's native name
    // (e.g. "中文" for zh, "繁體中文" for zh-Hant). Falling back to
    // 'English' keeps v1.21.x behaviour for unrecognised language codes.
    const userLanguage = WIKI_LANGUAGES[this.settings.language] ?? 'Chinese';

    const prompt = PROMPTS.suggestSchemaUpdate
      .replace('{{schema_content}}', schemaContent)
      .replace('{{analysis_context}}', context)
      .replace('{{user_language}}', userLanguage);

    try {
      const response = await this.client.createMessage({
        model: this.settings.model,
        max_tokens: capMaxTokens(TOKENS_SCHEMA_SUGGESTION, this.settings),
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        // v1.22.0 #97: pass the full LLMClient interface — enableThinking
        // (user-controlled, NEVER hardcoded), maxTokensPerCall (truncation
        // retry), and temperature (custom sampling, per user settings).
        // These fields are ALL optional on LLMClient.createMessage; the
        // client wrapper decides whether to send them to the provider.
        ...(this.settings.disableThinking ? { enableThinking: false } : {}),
        maxTokensPerCall: this.settings.maxTokensPerCall || undefined,
        temperature: this.settings.extractionTemperature,
      });

      // v1.22.0 #97: use the dedicated parser to extract new_schema_body
      // (frontmatter-stripped, ready to splice). Legacy v1.21.x responses
      // without new_schema_body still parse correctly.
      const parsed = parseSchemaSuggestion(response);

      const suggestion: SchemaSuggestion = {
        timestamp: new Date().toISOString(),
        source: 'manual',
        changes_needed: parsed.changes_needed,
        suggestions: parsed.suggestions,
        newSchemaBody: parsed.newSchemaBody,
      };

      // Append to suggestions.md
      await this.appendSuggestion(suggestion);

      return suggestion;
    } catch (error) {
      console.error('Schema suggestion failed:', error);
      return null;
    }
  }

  private parseConfigFile(content: string): WikiSchema {
    let version = 0;
    let updated = '';
    let auto_suggestion_count = 0;
    let body = content;

    // Parse YAML frontmatter (between first two --- lines)
    if (content.startsWith('---')) {
      const end = content.indexOf('---', 3);
      if (end > 0) {
        const fmLines = content.substring(3, end).trim().split('\n');
        for (const line of fmLines) {
          const colon = line.indexOf(':');
          if (colon > 0) {
            const key = line.substring(0, colon).trim();
            const value = line.substring(colon + 1).trim();

            if (key === 'version') {
              version = parseInt(value) || 0;
            } else if (key === 'updated') {
              updated = value;
            } else if (key === 'auto_suggestion_count') {
              auto_suggestion_count = parseInt(value) || 0;
            }
          }
        }
        body = content.substring(end + 3).trim();
      }
    }

    return { version, updated, auto_suggestion_count, body };
  }

  private async appendSuggestion(suggestion: SchemaSuggestion): Promise<void> {
    const path = this.getSuggestionsPath();
    const existing = this.app.vault.getAbstractFileByPath(path);

    const entry = `## Suggestion — ${suggestion.timestamp}

**Source:** ${suggestion.source}
**Changes needed:** ${suggestion.changes_needed ? 'Yes' : 'No'}

${suggestion.suggestions}

---
`;

    if (existing instanceof TFile) {
      await this.app.vault.process(existing, (current) => current + '\n' + entry);
    } else {
      const header = `# Schema Suggestions\n\n> Suggestions for improving your Wiki Schema. Review and decide whether to apply them to \`schema/config.md\`.\n\n---\n\n`;
      await this.app.vault.create(path, header + entry);
    }
  }
}
