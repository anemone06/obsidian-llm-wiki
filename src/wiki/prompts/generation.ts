// Generation prompts — entity, concept, and summary page creation

export const GENERATION_PROMPTS = {
  generateEntityPage: `You are a Wiki knowledge base maintainer. Create a Wiki page for the following entity.

**Entity Information:**
- Name: {{entity_name}}
- Type: {{entity_type}}
- Summary: {{entity_summary}}
- Mentions in source (VERBATIM — preserve original language): {{mentions}}
- Related entities: {{related_entities}}
- Related concepts: {{related_concepts}}
- Extraction aliases (seeds): {{extraction_aliases}}

**Existing Wiki Pages (use these exact full paths when referencing):**
{{existing_pages}}

**Existing Related Content in Wiki:**
{{related_content}}

{{merge_strategy}}

**Task Requirements:**
1. Create an entity page with basic and key information
2. When referencing other pages, copy the wiki-link format EXACTLY from the "Existing Wiki Pages" list. The LEFT side of | is the full path (entities/Page-Name), the RIGHT side is the DISPLAY NAME ONLY. NEVER duplicate folder prefixes like entities/ or concepts/ in the display name. Example: [[entities/Qwen|Qwen]] is CORRECT, [[entities/Qwen|entities/Qwen]] is WRONG
3. IMPORTANT: All related entities and concepts MUST be formatted as wiki-links using the [[path|display]] format — even if the target page does not yet exist in the Wiki. This allows the Lint system to detect dead links and create stub pages later. Never output a related entity/concept name as plain text.
4. If the entity already exists in the Wiki, use the merge strategy above for intelligent merging
4. Be objective, accurate, and concise
5. **Generate aliases for this page** — provide 1-3 alternative names. This field is REQUIRED:
   - Include acronyms, abbreviations, and same-language alternative names
   - English is universally acceptable as a "linker language" — when a term originates in English
     (e.g. "Transformer", "DNA", "API", "RoPE", "CUDA"), keep it as-is even in non-English wikis
   - **CRITICAL: do NOT invent translations for established technical terms.** If a term is universally
     used in English across scientific literature, do NOT coin a Chinese/Japanese/German equivalent
     that doesn't exist in real-world usage. Real-world convention always wins over linguistic purity.
   - **If no natural alias exists**, use the page title itself as the first alias. The aliases field MUST NOT be left empty — always provide at least one alias

   Examples:
   - 维生素 B2 (Chinese wiki) → ["维他命 B2", "Vitamin B2", "VB2"]
   - Transformer (Chinese wiki) → ["Transformers", "BERT"]      ← NO 变换器 (no such usage in Chinese)
   - Rotary Position Embedding (Japanese wiki) → ["RoPE", "回転位置埋め込み"]
   - Neural Network (Chinese wiki) → ["神经网络", "NN"]
6. In "Mentions in Source" section: preserve the VERBATIM quotes in their ORIGINAL language. You may ADD a brief translation in parentheses if the wiki language differs, but the original text must be preserved exactly

**Output Format:**
---
type: entity  # MUST be exactly "entity" - do not change this value
created: {{date}}
updated: {{date}}
sources: ["[[{{source_file}}]]"]
tags: [{{entity_type}}]  # Use entity_type (e.g., product, person, organization) as a tag
aliases: ["Alternative name or translation"]  # REQUIRED: at least 1 alias, must NOT be empty
---

# {{entity_name}}

## {{section_basic_information}}
- Type: {{entity_type}}
- Source: [[{{source_file}}]]

## {{section_description}}
[Detailed description of the entity with bidirectional links]

## {{section_related_entities}}
[Reference related entities using full paths from the list above]

## {{section_related_concepts}}
[Reference related concepts using full paths from the list above]

## {{section_mentions_in_source}}
[Each verbatim quote as an academic-footnote style entry. The provided mentions in the input already include the source wiki-link — keep them as-is. If you need to add more quotes, use the same format:
- "Verbatim quote in original language (optional translation)" — [[source-name]]]

---`,

  generateConceptPage: `You are a Wiki knowledge base maintainer. Create a Wiki page for the following concept.

**Concept Information:**
- Name: {{concept_name}}
- Type: {{concept_type}}
- Summary: {{concept_summary}}
- Mentions in source (VERBATIM — preserve original language): {{mentions}}
- Related concepts: {{related_concepts}}
- Related entities: {{related_entities}}
- Extraction aliases (seeds): {{extraction_aliases}}

**Existing Wiki Pages (use these exact full paths when referencing):**
{{existing_pages}}

**Existing Related Content in Wiki:**
{{related_content}}

{{merge_strategy}}

**Task Requirements:**
1. Create a concept page including definition, characteristics, and applications
2. When referencing other pages, copy the wiki-link format EXACTLY from the "Existing Wiki Pages" list. The LEFT side of | is the full path (concepts/Page-Name), the RIGHT side is the DISPLAY NAME ONLY. NEVER duplicate folder prefixes like entities/ or concepts/ in the display name. Example: [[concepts/Attention|Attention]] is CORRECT, [[concepts/Attention|concepts/Attention]] is WRONG
3. IMPORTANT: All related entities and concepts MUST use [[wiki-link]] format even if the target page does not yet exist — this allows the Lint system to detect and fix them later. Never output a related entity/concept name as plain text.
4. If the concept already exists in the Wiki, use the merge strategy above for intelligent merging
4. Be objective, accurate, and concise
5. **Generate aliases for this page** — provide 1-3 alternative names. This field is REQUIRED:
   - Include acronyms, abbreviations, and same-language alternative names
   - English is universally acceptable as a "linker language" — when a term originates in English
     (e.g. "Transformer", "DNA", "API", "RoPE", "CUDA"), keep it as-is even in non-English wikis
   - **CRITICAL: do NOT invent translations for established technical terms.** If a term is universally
     used in English across scientific literature, do NOT coin a Chinese/Japanese/German equivalent
     that doesn't exist in real-world usage. Real-world convention always wins over linguistic purity.
   - **If no natural alias exists**, use the page title itself as the first alias. The aliases field MUST NOT be left empty — always provide at least one alias

   Examples:
   - 维生素 B2 (Chinese wiki) → ["维他命 B2", "Vitamin B2", "VB2"]
   - Transformer (Chinese wiki) → ["Transformers", "BERT"]      ← NO 变换器 (no such usage in Chinese)
   - Rotary Position Embedding (Japanese wiki) → ["RoPE", "回転位置埋め込み"]
   - Neural Network (Chinese wiki) → ["神经网络", "NN"]
6. In "Mentions in Source" section: preserve the VERBATIM quotes in their ORIGINAL language. You may ADD a brief translation in parentheses if the wiki language differs, but the original text must be preserved exactly

**Output Format:**
---
type: concept  # MUST be exactly "concept" - do not change this value
created: {{date}}
updated: {{date}}
sources: ["[[{{source_file}}]]"]
tags: [{{concept_type}}]  # Use concept_type (e.g., theory, method, field) as a tag
aliases: ["Alternative name or translation"]  # REQUIRED: at least 1 alias, must NOT be empty
---

# {{concept_name}}

## {{section_definition}}
[Clear definition of the concept]

## {{section_key_characteristics}}
- Characteristic 1
- Characteristic 2

## {{section_applications}}
[Application scenarios for the concept]

## {{section_related_concepts}}
[Reference related concepts using full paths from the list above]

## {{section_related_entities}}
[Reference related entities using full paths from the list above]

## {{section_mentions_in_source}}
[Each verbatim quote as an academic-footnote style entry. The provided mentions in the input already include the source wiki-link — keep them as-is. If you need to add more quotes, use the same format:
- "Verbatim quote in original language (optional translation)" — [[source-name]]]

---`,

  generateSummaryPage: `You are a Wiki knowledge base maintainer. Create a summary page for the following source file.

**Source File Information:**
- Title: {{source_title}}
- Content: {{content}}
- Analysis Results: {{analysis}}

**All Created Wiki Pages (use these exact full paths when referencing):**
{{created_pages_list}}

**Task Requirements:**
1. Create a concise summary page
2. When referencing entities and concepts, use the exact full path format from the "All Created Wiki Pages" list above
3. {{constraints}}
4. Highlight key points
5. Be objective and accurate
6. **Generate aliases for this page** — provide 1-2 alternative names for the source. This field is REQUIRED:
   - Include alternative titles, abbreviations, or common alternative names for the source
   - English is universally acceptable as a "linker language" — when a term originates in English
     (e.g. "Transformer", "DNA", "API", "RoPE"), keep it as-is even in non-English wikis
   - **CRITICAL: do NOT invent translations for established technical terms.** Real-world usage
     always wins over linguistic purity. Only include translations that actually exist in the target language.
   - **If no natural alias exists**, use the source file name or the page title itself. The aliases field MUST NOT be left empty — always provide at least one alias

**Output Format:**
---
type: source
created: {{date}}
updated: {{date}}
source_file: "[[{{source_file}}]]"
tags: [{{tags}}]
aliases: ["Alternative title or translation"]  # REQUIRED: at least 1 alias, must NOT be empty
---

# {{source_title}} - Summary

## {{section_source}}
- Original file: [[{{source_file}}]]
- Ingested: {{date}}

## {{section_core_content}}
[100-200 word summary with bidirectional links]

## {{section_key_entities}}
[Reference entities using full paths from the list above]

## {{section_key_concepts}}
[Reference concepts using full paths from the list above]

## {{section_main_points}}
- Point 1
- Point 2

---`,

  // Variant used when the existing page has `reviewed: true` in frontmatter.
  preserveReviewedEntityPage: `You are a Wiki knowledge base maintainer. The following entity page has been manually reviewed by the user (reviewed: true).

**⚠️ Important: User-reviewed content must be fully preserved. Do NOT delete or rewrite.**

**Entity Information (from new source file):**
- Name: {{entity_name}}
- Type: {{entity_type}}
- Summary: {{entity_summary}}
- Mentions in source: {{mentions}}

**Existing Wiki Pages (use these exact full paths when referencing):**
{{existing_pages}}

**User-Reviewed Existing Page Content (MUST be fully preserved):**
{{related_content}}

**Task Requirements:**
1. **Fully preserve** all user-reviewed content — do not delete or rewrite any paragraph
2. Only add non-duplicate information from the new source at the end in a "New Information" section
3. If new information duplicates or contradicts existing content, do NOT add it; keep the user's version
4. The frontmatter MUST retain reviewed: true
5. When referencing other pages, copy the wiki-link format EXACTLY from the list above. NEVER duplicate folder prefixes in the display name. Example: [[entities/Qwen|Qwen]] is CORRECT, [[entities/Qwen|entities/Qwen]] is WRONG

**Output Format:**
---
type: entity
created: {{date}}
updated: {{date}}
sources: ["[[{{source_file}}]]"]
tags: [{{tags}}]
aliases: []
reviewed: true
---

[Fully preserve user-reviewed existing content here]

## {{section_new_information}} ({{date}})
[Only add non-duplicate new information; write "No new information" if none]

---`,

  // Variant used when the existing concept page has `reviewed: true` in frontmatter.
  preserveReviewedConceptPage: `You are a Wiki knowledge base maintainer. The following concept page has been manually reviewed by the user (reviewed: true).

**⚠️ Important: User-reviewed content must be fully preserved. Do NOT delete or rewrite.**

**Concept Information (from new source file):**
- Name: {{concept_name}}
- Type: {{concept_type}}
- Summary: {{concept_summary}}
- Mentions in source: {{mentions}}
- Related concepts: {{related_concepts}}

**Existing Wiki Pages (use these exact full paths when referencing):**
{{existing_pages}}

**User-Reviewed Existing Page Content (MUST be fully preserved):**
{{related_content}}

**Task Requirements:**
1. **Fully preserve** all user-reviewed content — do not delete or rewrite any paragraph
2. Only add non-duplicate information from the new source at the end in a "New Information" section
3. If new information duplicates or contradicts existing content, do NOT add it; keep the user's version
4. The frontmatter MUST retain reviewed: true
5. When referencing other pages, copy the wiki-link format EXACTLY from the list above. NEVER duplicate folder prefixes in the display name. Example: [[entities/Qwen|Qwen]] is CORRECT, [[entities/Qwen|entities/Qwen]] is WRONG

**Output Format:**
---
type: concept
created: {{date}}
updated: {{date}}
sources: ["[[{{source_file}}]]"]
tags: [{{tags}}]
aliases: []
reviewed: true
---

[Fully preserve user-reviewed existing content here]

## {{section_new_information}} ({{date}})
[Only add non-duplicate new information; write "No new information" if none]

---`,

  suggestSchemaUpdate: `你是 Wiki Schema 顾问。请审阅当前 Schema 和最近一次摄入/维护分析。

当前 Schema：
{{schema_content}}

分析上下文：
{{analysis_context}}

任务：判断 Schema 是否需要更新，以便更好地适配最近的内容。
请考虑：
1. 是否有新的实体类型需要加入分类规则？
2. 是否有新的概念类型需要加入？
3. 命名规范是否需要调整？
4. 页面模板是否需要更新（缺少章节、结构更合理等）？
5. 维护策略是否需要修订（过期阈值、严重度级别等）？

输出 JSON 格式：
{
  "changes_needed": true,
  "new_schema_body": "完整的更新后 Schema 正文，使用 Markdown，从 H1 标题开始。包含更新后应存在的所有章节；无需修改的章节可以原样保留。",
  "suggestions": "用 Markdown 简要说明建议变更和原因（1-3 句）"
}

如果不需要变更：
{
  "changes_needed": false,
  "suggestions": "简短说明为什么无需变更"
}

重要要求：
- "suggestions" 字段必须使用下方用户界面语言。除非用户界面语言是 English，否则不要默认使用英文。
- new_schema_body 是变更后的完整 Schema，不是 diff，也不是 patch。应用路径会用 new_schema_body 原样替换当前正文。
- new_schema_body 必须保持中文说明和中文章节标题；保留路径、frontmatter key、type/tag 枚举等机器可读标识为英文。
- 不要在 new_schema_body 中包含 YAML frontmatter（--- ... ---）。请直接从 H1 标题开始，例如 "# Wiki Schema 配置"。
- 不要用 markdown 代码块包裹 new_schema_body（\`\`\`）。解析器会尝试剥离代码块，但干净输出更可靠。
- 保留仍然相关的现有章节。只修改分析真正需要修改的部分。
- 只输出 JSON，不要输出其他文字。

User UI language: {{user_language}}`,
};
