// welcome-note-template.ts — First-run Welcome note generator (v1.23.0)
//
// Pure function. Renders the Welcome note body in Simplified Chinese so
// a first-run fallback never drops the user into an English onboarding page.

export interface LlmConfigStatus {
  ok: boolean;
  provider?: string;
  model?: string;
  /** Set when ok=false. Human-readable reason (e.g. "API key not configured"). */
  error?: string;
}

export interface BuildWelcomeNoteArgs {
  llmConfig: LlmConfigStatus;
  /** ISO date for the frontmatter `created` field. */
  createdAt: string;
}

export function buildWelcomeNote(args: BuildWelcomeNoteArgs): string {
  const { llmConfig, createdAt } = args;

  const parts = [
    renderFrontmatter(llmConfig, createdAt),
    '# 欢迎使用你的 LLM-Wiki',
    '这篇笔记由 YJY LLM Wiki 插件在首次运行时自动生成。你不需要编辑它，快速读一遍后就可以开始导入笔记。',
    renderVerifySection(llmConfig),
    renderHowToUseSection(),
    renderStructureSection(),
    renderQuickStartSection(),
  ];

  return parts.filter(p => p.length > 0).join('\n\n') + '\n';
}

function renderFrontmatter(llmConfig: LlmConfigStatus, createdAt: string): string {
  const lines = [
    '---',
    'title: Wiki 创始笔记',
    'type: welcome',
    `created: ${createdAt}`,
  ];
  lines.push(`llm_config_status: ${llmConfig.ok ? 'ok' : 'failed'}`);
  if (llmConfig.ok) {
    if (llmConfig.provider) lines.push(`llm_config_provider: ${llmConfig.provider}`);
    if (llmConfig.model) lines.push(`llm_config_model: ${llmConfig.model}`);
  } else if (llmConfig.error) {
    lines.push(`llm_config_error: "${llmConfig.error.replace(/"/g, '\\"')}"`);
  }
  lines.push('---');
  return lines.join('\n');
}

function renderVerifySection(llmConfig: LlmConfigStatus): string {
  if (llmConfig.ok) {
    return [
      '## 如何验证安装',
      '',
      '如果你能读到这篇中文欢迎页，插件安装和中文默认配置已经生效。',
      '',
      'LLM 配置可以在 **设置 → YJY LLM Wiki → LLM 配置 → 测试连接** 中验证，看到 ✅ 即可继续。',
    ].join('\n');
  }
  return [
    '## 如何验证安装',
    '',
    '如果你还不能生成 Wiki，请先确认 LLM 配置可用：',
    '',
    '1. 打开 **设置 → YJY LLM Wiki → LLM 配置**。',
    '2. 选择 provider，填写必要配置，并选择模型。',
    '3. 点击 **测试连接**，看到 ✅ 后再继续。',
    '4. 点击 **保存设置**，然后可以在命令面板运行 `YJY LLM Wiki: 重建 Wiki 欢迎页`。',
  ].join('\n');
}

function renderHowToUseSection(): string {
  return [
    '## 如何使用这个插件',
    '',
    '用 `Ctrl/Cmd + P` 打开命令面板，搜索 “YJY LLM Wiki”。第一天通常只需要从第一个命令开始。',
    '',
    '| 命令 | 作用 |',
    '| --- | --- |',
    '| `YJY LLM Wiki: 多选文件摄入` | 选择多篇源笔记，插件会抽取实体、概念、来源并写入 Wiki 页面。**第一天从这里开始。** |',
    '| `YJY LLM Wiki: 摄入单个源文件` | 导入单篇源笔记。 |',
    '| `YJY LLM Wiki: 从文件夹摄入` | 导入某个文件夹里的所有笔记，例如 `inbox/2024/`。 |',
    '| `YJY LLM Wiki: 查询 Wiki` | 打开右侧聊天面板，基于已导入内容提问。 |',
    '| `YJY LLM Wiki: 维护 Wiki` | 运行 Wiki 检查流程，例如死链、孤立页、重复页；Wiki 有约 30 页后再用更合适。 |',
    '| `YJY LLM Wiki: 查看摄入历史` | 查看历史导入记录，以及每次创建或更新了哪些页面。 |',
    '| `YJY LLM Wiki: 重建 Wiki 欢迎页` | 按当前语言重新生成这篇欢迎笔记。 |',
    '',
    '右侧查询面板也可以通过侧边栏的聊天气泡图标打开。',
  ].join('\n');
}

function renderStructureSection(): string {
  return [
    '## Wiki 结构说明',
    '',
    '导入源笔记后，插件会在 `wiki/` 文件夹里写入一组结构化页面。理解三个核心页面类型，以及可选的 Schema 层，是后续手动整理 Wiki 时最有用的背景知识。',
    '',
    '### 三种核心页面类型',
    '',
    '- **`entities/`**：具名对象，例如人物、组织、项目、产品、事件、地点。一篇源笔记通常会生成多个实体页。实体页包含别名、摘要、出现过的源笔记（`mentions_in_source`），以及相关实体和概念链接。',
    '- **`concepts/`**：主题、方法、定义、研究领域、反复出现的想法。例如 “PPR”、“心脏病学”、“schema-driven design” 都可以是概念。概念页会链接到其他概念页，实体页也会链接到概念页。',
    '- **`sources/`**：每篇导入的源笔记对应一个来源页，包含原文内容和 `source_file` frontmatter 字段。来源页是溯源锚点，实体页和概念页会列出提到它们的来源页，方便从主题回到原始笔记。',
    '',
    '### Schema 层（可选）',
    '',
    '你可以在 **设置 → YJY LLM Wiki → Schema** 中启用 Schema。启用后，插件会维护 `wiki/schema/` 文件夹，用来描述这套 Wiki 的词表、标签类别、章节模板，以及实体/概念类型。',
    '',
    'Schema 会写在一个 Obsidian 页面里：[[wiki/schema/config]]。打开它可以查看当前词表；当词表变化时，插件会重写这个页面。',
    '',
    '- 导入提示词会绑定到这个词表，因此 LLM 会从固定列表中选择标签和章节标题，而不是自由发挥。',
    '- 当 LLM 发现结构漂移，例如出现了词表外的新概念，建议会出现在 Lint 报告里，你可以先接受或拒绝。',
    '- 当词表变化时，已有页面会被重写以匹配新结构，并自动备份到 `.llm-wiki-backups/schema/`，最多保留 3 份。',
    '',
    '不启用 Schema 插件也能工作，三种核心页面仍会生成。Schema 主要是给成熟 Wiki 增加稳定结构，让查询更可靠。',
    '',
    '### Wiki 链接图',
    '',
    '两个页面之间的每个 `[[wiki-link]]` 都代表 LLM 在导入时建立的一条关系。插件查询时使用这张链接图，而不是 embedding。实用理解是：整理好的 Wiki 链接图就是这套知识库的“搜索索引”。你可以在任何页面手动新增或编辑 `[[X]]` 链接，下一次查询就会使用它。',
    '',
    '### 文件夹布局',
    '',
    '所有 Wiki 文件默认写入 `wiki/`，也可以在设置里的 Wiki 文件夹中修改：',
    '',
    '```',
    'wiki/',
    '├── entities/    # 具名对象：人物、组织、项目等',
    '├── concepts/    # 主题、方法、定义',
    '├── sources/     # 每篇导入笔记对应一个来源页',
    '├── schema/      # 可选词表和章节模板',
    '├── index.md     # 自动生成的图谱索引',
    '└── log.md       # 自动生成的活动日志',
    '```',
  ].join('\n');
}

function renderQuickStartSection(): string {
  return [
    '## 快速开始',
    '',
    '1. **选择几篇源笔记导入。** 在命令面板运行 `YJY LLM Wiki: 多选文件摄入`，勾选要导入的笔记，然后点击 **加入队列**。弹窗会保持打开，方便观察进度。',
    '2. **等待导入完成。** 每篇笔记通常需要 10 到 60 秒进行 LLM 抽取。你可以继续做别的事，完成后会显示通知。`查看摄入历史` 会列出每次导入结果。',
    '3. **试一次查询。** 打开右侧查询 Wiki 面板，也就是聊天气泡图标，问一个和内容相关的问题。',
    '4. **按需调整设置。** 设置 → YJY LLM Wiki：语言、Wiki 文件夹、Schema、标签词表、自动监听。默认配置适合新 vault。',
    '',
    '> 完整指南见 README：github.com/anemone06/obsidian-llm-wiki',
  ].join('\n');
}
