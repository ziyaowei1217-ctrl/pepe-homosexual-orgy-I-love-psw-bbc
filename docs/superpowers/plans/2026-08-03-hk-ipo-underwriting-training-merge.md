# Hong Kong IPO Underwriting Training Deck Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a 16:9 Caitong Hong Kong blue-gold training deck that integrates both source decks into a concise core module plus a complete appendix without dropping historical or dated substantive content.

**Architecture:** Use the Caitong Hong Kong PPTX as the only template source. Inspect both decks, map every output slide to a duplicated Caitong source slide, create a validated starter deck, then edit inherited objects and add only explicitly bounded content primitives. Export with `@oai/artifact-tool`, render every slide, and validate visual fidelity, content coverage, placeholders, and canvas overflow.

**Tech Stack:** JavaScript ES modules, `@oai/artifact-tool`, bundled presentation template-following scripts, Poppler/LibreOffice render helpers, JSON frame maps, PowerPoint `.pptx`.

## Global Constraints

- Final output: `/Users/a1-6/Desktop/pepe homosexual orgy I love psw bbc/香港IPO上市规则与承销执行培训_财通蓝金合并版.pptx`.
- Template source: `/Users/a1-6/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_d2vsuaqi76lc22_1cf7/msg/file/2026-07/财通香港_香港上市规则与上市承销培训_蓝金版_v0.3_Logo透明版  -  已修复.pptx`.
- Content source: `/Users/a1-6/Downloads/佰辰医疗销售策略讨论材料.pptx`.
- Use the Caitong 16:9 blue-gold master, layouts, logo, footer, and typography; do not mix in the Baichen red-blue visual system.
- Retain all substantive historical data, old rules, market statistics, and cases with their original dates and sources.
- Mark dated content consistently as historical material and state that live projects must use current HKEX and regulator requirements.
- Do not merge unlike time periods or statistical definitions into a single calculated trend.
- Keep approximately 34–36 core slides and 14–15 appendix slides, with an overall target of 48–50 slides.
- Build and export only through `@oai/artifact-tool`; do not use `python-pptx` or direct OOXML mutation.
- Preserve the template master → layout → slide hierarchy.
- Render and inspect every final slide; no unintended overlaps, clipping, title wrapping, blank placeholders, missing logos, or duplicate footers.

---

### Task 1: Lock the content inventory and template mapping

**Files:**
- Create: `.pptx-merge-work/final/content-inventory.json`
- Create: `.pptx-merge-work/final/template-audit.txt`
- Create: `.pptx-merge-work/final/source-notes.txt`
- Create: `.pptx-merge-work/final/deviation-log.txt`
- Create: `.pptx-merge-work/final/template-frame-map.json`
- Create: `.pptx-merge-work/final/validate-content-map.mjs`

**Interfaces:**
- Consumes: the two template inspection directories already generated under `.pptx-merge-work/cthk/template-inspect` and `.pptx-merge-work/baichen/template-inspect`.
- Produces: a sequential `outputSlides` mapping with 48–50 entries; every Caitong and Baichen substantive source slide appears in `content-inventory.json` with status `core`, `appendix`, or `repurposed-divider`.

- [ ] **Step 1: Write the failing coverage validator**

```js
import fs from "node:fs";

const inventory = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const map = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const covered = new Set(map.outputSlides.flatMap((slide) => slide.contentSources ?? []));
const missing = inventory.items
  .filter((item) => item.substantive !== false)
  .filter((item) => !covered.has(item.key));
if (missing.length) {
  console.error(JSON.stringify({ missing }, null, 2));
  process.exit(1);
}
if (map.outputSlides.some((slide, i) => slide.outputSlide !== i + 1)) process.exit(2);
console.log(`coverage-pass slides=${map.outputSlides.length} sources=${covered.size}`);
```

- [ ] **Step 2: Run the validator before the inventory and map exist**

Run: `node .pptx-merge-work/final/validate-content-map.mjs .pptx-merge-work/final/content-inventory.json .pptx-merge-work/final/template-frame-map.json`

Expected: FAIL because the content inventory and frame map have not been created.

- [ ] **Step 3: Create the inventory and frame map**

Use the core order: opening and training map → historical Hong Kong market baseline → 2025–2026 market/biotech window → listing rules and execution → underwriting structure. Put detailed sales tactics, market outlook continuation, retail promotion, order strategy, perfect-IPO framework, and post-listing market-cap management in the appendix. Map every output slide to a Caitong source slide with `reuseMode: "duplicate-slide"`, inherited `rewrite`/`replace`/`delete` targets, and explicit bounded `add` targets only when the selected source frame lacks enough inherited content slots.

- [ ] **Step 4: Run content coverage and template-plan validation**

Run: `node .pptx-merge-work/final/validate-content-map.mjs .pptx-merge-work/final/content-inventory.json .pptx-merge-work/final/template-frame-map.json`

Expected: `coverage-pass` with 48–50 output slides and no uncovered substantive source item.

Run: `node /Users/a1-6/.codex/plugins/cache/openai-primary-runtime/presentations/26.802.11031/skills/presentations/template_following_scripts/validate_template_plan.mjs --workspace .pptx-merge-work/cthk --map .pptx-merge-work/final/template-frame-map.json --inspect .pptx-merge-work/cthk/template-inspect/template-inspect.ndjson --source-slide-count 23`

Expected: JSON report with `"status": "pass"`.

### Task 2: Create and verify the duplicated-slide starter deck

**Files:**
- Create: `.pptx-merge-work/final/template-starter.pptx`
- Create: `.pptx-merge-work/final/template-starter-preview/`
- Create: `.pptx-merge-work/final/template-starter-layout/`
- Create: `.pptx-merge-work/final/template-starter-contact-sheet.png`

**Interfaces:**
- Consumes: `.pptx-merge-work/final/template-frame-map.json`.
- Produces: a Caitong-only starter presentation whose slide order matches the final core-plus-appendix narrative.

- [ ] **Step 1: Generate the starter deck**

Run: `node /Users/a1-6/.codex/plugins/cache/openai-primary-runtime/presentations/26.802.11031/skills/presentations/template_following_scripts/prepare_template_starter_deck.mjs --workspace .pptx-merge-work/cthk --pptx "/Users/a1-6/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_d2vsuaqi76lc22_1cf7/msg/file/2026-07/财通香港_香港上市规则与上市承销培训_蓝金版_v0.3_Logo透明版  -  已修复.pptx" --map .pptx-merge-work/final/template-frame-map.json --out .pptx-merge-work/final/template-starter.pptx --preview-dir .pptx-merge-work/final/template-starter-preview --layout-dir .pptx-merge-work/final/template-starter-layout --contact-sheet .pptx-merge-work/final/template-starter-contact-sheet.png`

Expected: output PPTX, per-slide PNGs/layout JSON, and a slide count matching the map.

- [ ] **Step 2: Inspect the contact sheet and selected full-size starter slides**

Confirm the cover, section dividers, market pages, rule tables, underwriting pages, and appendix frames all use the Caitong logo and 16:9 geometry.

### Task 3: Author the merged deck in inherited frames

**Files:**
- Create: `.pptx-merge-work/final/build-merged-deck.mjs`
- Create: `.pptx-merge-work/final/final-preview/`
- Create: `.pptx-merge-work/final/final-layout/`
- Create: `.pptx-merge-work/final/final-montage.webp`
- Create: `香港IPO上市规则与承销执行培训_财通蓝金合并版.pptx`

**Interfaces:**
- Consumes: `template-starter.pptx`, `template-frame-map.json`, the Baichen layout JSON and slide renders, and the source notes.
- Produces: the editable final PPTX plus slide renders and layout exports.

- [ ] **Step 1: Implement deterministic imported-deck helpers**

```js
function getSlide(presentation, oneBasedSlide) {
  return presentation.slides.getItem(oneBasedSlide - 1);
}

function addHistoricalNote(slide, text = "历史资料｜数据与规则按原材料时点保留，项目执行请核验现行规定") {
  const note = slide.shapes.add({
    geometry: "textbox",
    name: "historical-material-note",
    position: { left: 78, top: 650, width: 920, height: 20 },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  note.text = text;
  note.text.style = { fontSize: 11, color: "#7A6530" };
}
```

Resolve and edit inherited objects by inspected anchor IDs. For bounded new content, use the exact `zone` authorized in the frame map. Preserve all master/layout elements, logos, and footer furniture.

- [ ] **Step 2: Populate core slides**

Copy the original Caitong content in place where it already matches the narrative. Reformat the Baichen content into Caitong frames with title, takeaway, table/chart/text evidence, source line, and historical marker. Keep data values and source wording from the Baichen source layout exports; do not invent or recalculate metrics.

- [ ] **Step 3: Populate appendix slides**

Move detailed sales strategy and post-listing content into the appendix without dropping bullet points, investor categories, order ratios, process steps, or source lines. Add a clear `附录` section divider and continue sequential page numbering.

- [ ] **Step 4: Export previews, layouts, montage, and PPTX**

Use `PresentationFile.importPptx(await FileBlob.load(starterPath))`, render each slide as PNG, export each slide as layout JSON, export a montage, and save the deck through `PresentationFile.exportPptx(presentation)`.

Expected: the final PPTX exists at the required output path and its slide count equals the frame map count.

### Task 4: Run structural, content, and visual QA

**Files:**
- Create: `.pptx-merge-work/final/qa-ledger.txt`
- Create: `.pptx-merge-work/final/content-coverage-report.json`
- Create: `.pptx-merge-work/final/qa/template-fidelity-check.json`

**Interfaces:**
- Consumes: final PPTX, final PNGs/layouts, starter deck/layouts, content inventory, and frame map.
- Produces: evidence that every slide is readable, all substantive content is covered, and template fidelity is preserved.

- [ ] **Step 1: Run slide-canvas overflow checks**

Run: `python3 /Users/a1-6/.codex/plugins/cache/openai-primary-runtime/presentations/26.802.11031/skills/presentations/container_tools/slides_test.py "/Users/a1-6/Desktop/pepe homosexual orgy I love psw bbc/香港IPO上市规则与承销执行培训_财通蓝金合并版.pptx"`

Expected: no overflow errors.

- [ ] **Step 2: Run content coverage again against the final slide count**

Run the content-map validator and verify that all substantive source keys are still assigned to an output slide.

- [ ] **Step 3: Run template fidelity validation**

Run: `node /Users/a1-6/.codex/plugins/cache/openai-primary-runtime/presentations/26.802.11031/skills/presentations/template_following_scripts/check_template_fidelity.mjs --workspace .pptx-merge-work/cthk --starter-pptx .pptx-merge-work/final/template-starter.pptx --final-pptx "/Users/a1-6/Desktop/pepe homosexual orgy I love psw bbc/香港IPO上市规则与承销执行培训_财通蓝金合并版.pptx" --map .pptx-merge-work/final/template-frame-map.json --starter-layout-dir .pptx-merge-work/final/template-starter-layout --final-layout-dir .pptx-merge-work/final/final-layout --edit-dir .pptx-merge-work/final`

Expected: pass with no unplanned deletion of logos, footer furniture, or inherited placeholders.

- [ ] **Step 4: Inspect every slide at full size**

Record one QA line per slide covering title fit, body fit, source visibility, historical label, logo/footer, and intentional versus unintended overlaps. Fix all failed lines and rerender affected slides.

- [ ] **Step 5: Run final freshness verification**

Re-run the full export, overflow, coverage, placeholder, and fidelity checks after the final edit. Confirm the output PPTX timestamp and nonzero file size before delivery.
