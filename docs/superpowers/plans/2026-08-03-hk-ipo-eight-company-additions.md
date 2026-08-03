# 港股 IPO 八家公司追加页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在原始 21 页港股 IPO 演示文稿基础上生成一份 29 页的新版本，追加 8 家公司的最新分析页并保持原有可编辑模板结构。

**Architecture:** 先以港交所与公司官网一手资料建立结构化内容与来源清单，再用模板检查脚本复制原稿全部页面，并从现有公司页复制 8 个新增页面。使用 `@oai/artifact-tool` 仅修改已映射的继承元素、替换申请文件截图、更新演讲者备注，最后导出并逐页渲染检查。

**Tech Stack:** Node.js ES modules、`@oai/artifact-tool`、演示文稿模板复用脚本、Poppler、PowerPoint PPTX。

## Global Constraints

- 原有 20 家公司的分析正文保持不变。
- 新增信息截止日为 2026 年 8 月 3 日。
- 新增公司为奕斯伟计算、上海基流科技、拿森智能、清陶能源、斯坦德机器人、成都国星宇航、上海仙工智能、山东安得医疗。
- 复用原稿公司页字体、字号、配色、间距、四块分析结构和申请文件截图区域；不创建新视觉模板。
- 原始 PPTX 不覆盖；最终文件写入 `/Users/a1-6/Desktop/财通实习成果/ipo概览/未上市港股ipo七月第一周概览_修正版(1)_新增8家公司_20260803.pptx`。
- 所有外部事实与图片在相应新增页演讲者备注中包含 `[Sources]` 来源块。
- 禁止使用 `python-pptx` 或直接修改 OOXML；PPTX 导入、编辑和导出必须使用 `@oai/artifact-tool`。

---

### Task 1: 建立可核验的八家公司资料包

**Files:**
- Create: `$TMP_DIR/companies.json`
- Create: `$TMP_DIR/source-notes.txt`
- Create: `$TMP_DIR/assets/application-proof/01-eswin.png`
- Create: `$TMP_DIR/assets/application-proof/02-jiliu.png`
- Create: `$TMP_DIR/assets/application-proof/03-nasn.png`
- Create: `$TMP_DIR/assets/application-proof/04-qingtao.png`
- Create: `$TMP_DIR/assets/application-proof/05-standard-robots.png`
- Create: `$TMP_DIR/assets/application-proof/06-adaspace.png`
- Create: `$TMP_DIR/assets/application-proof/07-seer.png`
- Create: `$TMP_DIR/assets/application-proof/08-ande.png`

**Interfaces:**
- Consumes: 港交所申请版本、聆讯后资料集、招股章程、配发结果、正式上市公告与公司官网。
- Produces: `companies.json`，其中每家公司包含 `number`、`displayName`、`legalName`、`score`、`industry`、`statusLine`、四个分析区块、`footerSource`、`notesSources` 和 `imagePath`。

- [ ] **Step 1: 确认法定主体与最新上市阶段**

逐家记录截至 2026-08-03 的港交所页面、申请/上市日期、保荐机构、股份代号（如已上市），并将直接链接写入 `$TMP_DIR/source-notes.txt`。

- [ ] **Step 2: 提取申请或正式上市文件封面**

下载每家公司港交所正式 PDF，以 `pdftoppm -f 1 -singlefile -png -r 144` 输出对应 PNG；若 PDF 为分章节文件，使用港交所申请版本首页文件而非媒体报道截图。

- [ ] **Step 3: 编写结构化分析内容**

每家公司写入 13 条短句：上市阶段/保荐/估值 3 条、股权/股东/管理层 3 条、业务/对标/差异化 3 条、可投性/风险/建议 3 条，加 1 条页面底部资料来源；每条长度控制在原模板单行或两行范围内。

- [ ] **Step 4: 校验资料包字段完整性**

运行：

```bash
node -e 'const d=require(process.argv[1]); if(d.length!==8) process.exit(1); for(const c of d){for(const k of ["number","displayName","legalName","score","industry","statusLine","sections","footerSource","notesSources","imagePath"]){if(!c[k]) throw new Error(`${c.displayName}:${k}`)} if(c.sections.length!==4) throw new Error(`${c.displayName}:sections`)}' "$TMP_DIR/companies.json"
```

Expected: 退出状态 0，且 8 个 PNG 均存在。

### Task 2: 建立模板映射与失败优先的验证器

**Files:**
- Create: `$TMP_DIR/template-audit.txt`
- Create: `$TMP_DIR/template-frame-map.json`
- Create: `$TMP_DIR/deviation-log.txt`
- Create: `$TMP_DIR/verify-deck.mjs`
- Create: `$TMP_DIR/template-starter.pptx`

**Interfaces:**
- Consumes: 原始 21 页 PPTX、`template-inspect.ndjson`、各页 layout JSON 和 `companies.json`。
- Produces: 保留原 21 页并从统一公司页复制 8 页的 29 页 starter deck；验证器接受一个 PPTX 路径并断言最终结构。

- [ ] **Step 1: 完成全稿模板审计**

在 `template-audit.txt` 记录封面与公司页结构、重复布局、字体、页脚、图片框、母版/布局继承和所有需要编辑的精确元素 ID；`deviation-log.txt` 只记录封面数量、日期、页码分母、8 页新增文本/图片/备注。

- [ ] **Step 2: 编写完整 frame map**

`template-frame-map.json` 将输出页 1–21 映射到同号源页，将输出页 22–29 映射到一个布局和元素完整的现有公司页；封面和页码元素标记为 `rewrite`，新增页的标题、评分、状态、四块正文、来源、页码和图片标记为 `rewrite` 或 `replace`，其余元素为 `keep`。

- [ ] **Step 3: 编写结构验证器**

`verify-deck.mjs` 使用 `PresentationFile.importPptx` 检查：总页数为 29；封面包含 28；公司页标题包含 8 家新增公司；不存在 `/20`；页码依次包含 `01/28` 至 `28/28`；每张新增页包含四个区块标题和 `[Sources]` 备注；导出 XML 不含空结构占位符。

- [ ] **Step 4: 在原稿上运行验证器确认失败**

Run:

```bash
node "$TMP_DIR/verify-deck.mjs" "/Users/a1-6/Desktop/财通实习成果/ipo概览/未上市港股ipo七月第一周概览_修正版(1).pptx"
```

Expected: FAIL，明确报告 `expected 29 slides, found 21`。

- [ ] **Step 5: 生成 starter deck**

Run:

```bash
node "$SKILL_DIR/template_following_scripts/prepare_template_starter_deck.mjs" --workspace "$TMP_DIR" --pptx "/Users/a1-6/Desktop/财通实习成果/ipo概览/未上市港股ipo七月第一周概览_修正版(1).pptx" --map "$TMP_DIR/template-frame-map.json" --out "$TMP_DIR/template-starter.pptx" --preview-dir "$TMP_DIR/template-starter-preview" --layout-dir "$TMP_DIR/template-starter-layout" --contact-sheet "$TMP_DIR/template-starter-contact-sheet.png"
```

Expected: 生成 29 页 starter deck，且 frame-map 校验通过。

### Task 3: 使用继承元素制作新增版本

**Files:**
- Create: `$TMP_DIR/build-deck.mjs`
- Create: `$TMP_DIR/final-preview/slide-01.png` through `$TMP_DIR/final-preview/slide-29.png`
- Create: `$TMP_DIR/final-layout/slide-01.layout.json` through `$TMP_DIR/final-layout/slide-29.layout.json`
- Create: `$TMP_DIR/final-montage.webp`
- Create: `/Users/a1-6/Desktop/财通实习成果/ipo概览/未上市港股ipo七月第一周概览_修正版(1)_新增8家公司_20260803.pptx`

**Interfaces:**
- Consumes: `template-starter.pptx`、`companies.json`、八张申请文件截图、frame map 中的稳定元素 ID。
- Produces: 保持模板结构的 29 页最终演示文稿及逐页渲染证据。

- [ ] **Step 1: 初始化 artifact-tool 工作区**

Run:

```bash
node "$SKILL_DIR/container_tools/setup_artifact_tool_workspace.mjs" --workspace "$TMP_DIR"
```

Expected: `$TMP_DIR/node_modules/@oai/artifact-tool` 可用。

- [ ] **Step 2: 编写最小编辑脚本**

`build-deck.mjs` 通过 `PresentationFile.importPptx(await FileBlob.load(starter))` 导入 starter deck；按 frame map 的元素 ID 修改封面、20 个旧页码分母和 8 个新增页的继承文本；用 `image.replace(...)` 保持原图片框 `frame/crop/fit/geometry/rotation`；用 `slide.notes.setText(...)` 写入 `[Sources]`；不使用 `presentation.slides.add()` 或新增覆盖形状。

- [ ] **Step 3: 导出逐页渲染、布局和 PPTX**

`build-deck.mjs` 对 29 页逐一导出 PNG 与 layout JSON，导出 montage，并通过 `PresentationFile.exportPptx(presentation)` 保存最终路径。

- [ ] **Step 4: 运行编辑脚本**

Run:

```bash
node "$TMP_DIR/build-deck.mjs"
```

Expected: 最终 PPTX、29 张 PNG、29 个 layout JSON 和 montage 全部生成。

- [ ] **Step 5: 运行结构验证器确认通过**

Run:

```bash
node "$TMP_DIR/verify-deck.mjs" "/Users/a1-6/Desktop/财通实习成果/ipo概览/未上市港股ipo七月第一周概览_修正版(1)_新增8家公司_20260803.pptx"
```

Expected: PASS，报告 29 页、8 家新增公司、28 个统一页码和 8 个来源备注均通过。

### Task 4: 全稿视觉与模板一致性验收

**Files:**
- Create: `$TMP_DIR/qa-ledger.txt`
- Modify: `$TMP_DIR/build-deck.mjs` only if QA identifies a defect
- Modify: `/Users/a1-6/Desktop/财通实习成果/ipo概览/未上市港股ipo七月第一周概览_修正版(1)_新增8家公司_20260803.pptx` only through rerunning `build-deck.mjs`

**Interfaces:**
- Consumes: 最终逐页 PNG、layout JSON、montage、starter deck 和 frame map。
- Produces: 每页都有结论的 QA ledger，且最终文件通过溢出和模板忠实度检查。

- [ ] **Step 1: 逐页检查 29 张 PNG**

在 `qa-ledger.txt` 为每页记录 `PASS` 或具体缺陷；重点检查标题不换行、图片清晰、四块正文不溢出、评分标签完整、底部来源和页码可读。

- [ ] **Step 2: 运行溢出检查**

Run:

```bash
python3 "$SKILL_DIR/container_tools/slides_test.py" "/Users/a1-6/Desktop/财通实习成果/ipo概览/未上市港股ipo七月第一周概览_修正版(1)_新增8家公司_20260803.pptx"
```

Expected: 无未处理的画布溢出或重叠警告。

- [ ] **Step 3: 运行模板忠实度检查**

Run:

```bash
node "$SKILL_DIR/template_following_scripts/check_template_fidelity.mjs" --workspace "$TMP_DIR" --starter-pptx "$TMP_DIR/template-starter.pptx" --final-pptx "/Users/a1-6/Desktop/财通实习成果/ipo概览/未上市港股ipo七月第一周概览_修正版(1)_新增8家公司_20260803.pptx" --map "$TMP_DIR/template-frame-map.json" --starter-layout-dir "$TMP_DIR/template-starter-layout" --final-layout-dir "$TMP_DIR/final-layout" --edit-dir "$TMP_DIR"
```

Expected: 所有计划内编辑被接受，未计划的模板元素无变更。

- [ ] **Step 4: 修复并重新验证任何缺陷**

只通过缩短文案、改用更合适的已复制公司页或修正继承元素内容解决；不得缩小模板字号或添加覆盖形状。重复 Task 3 Step 4–5 与 Task 4 Step 1–3，直至全部通过。

- [ ] **Step 5: 提交计划与制作脚本记录**

Run:

```bash
git add docs/superpowers/plans/2026-08-03-hk-ipo-eight-company-additions.md
git commit -m "docs: plan hk ipo deck additions"
```

Expected: 仅提交计划文件；最终 PPTX 位于用户指定目录，不加入仓库。
