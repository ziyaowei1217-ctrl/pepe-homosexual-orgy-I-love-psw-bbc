# NASN A4 Teaser Icon Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an editable copy of the NASN A4 Teaser with eight icons from slide 2 placed meaningfully on slide 1, consistent typography, and verified layout fidelity.

**Architecture:** Import a template-derived starter PPTX with `@oai/artifact-tool`, preserve both source slides, replace the six inherited investment-highlight image objects, add two bounded images in the existing industry-overview whitespace, and make focused font-size edits through stable inspect anchors. Export a new PPTX and verify every slide visually and structurally.

**Tech Stack:** JavaScript ES modules, `@oai/artifact-tool`, `sharp`, bundled presentation rendering and template-fidelity tools.

## Global Constraints

- Do not overwrite `/Users/a1-6/Desktop/财通实习成果/ipo概览/NASN_A4_Teaser_BlueGold  -  已修复.pptx`.
- Preserve all copy, data, A4 portrait dimensions, blue-gold palette, font family, font color, and font weight.
- Preserve slide 2 as the icon-source/reference page.
- Keep every object editable and preserve the imported master → layout → slide hierarchy.
- Add no external assets or claims; all added visuals must come from slide 2.
- Final slide 1 must have no clipping, unintended overlap, or off-canvas objects.

---

### Task 1: Build a validated template starter

**Files:**
- Create: `.ppt-review.v4e0AV/template-audit.txt`
- Create: `.ppt-review.v4e0AV/template-frame-map.json`
- Create: `.ppt-review.v4e0AV/deviation-log.txt`
- Create: `.ppt-review.v4e0AV/template-starter.pptx`

**Interfaces:**
- Consumes: the source PPTX and existing template inspection in `.ppt-review.v4e0AV/template-inspect/`.
- Produces: a two-slide starter deck and a validated edit map for Task 2.

- [ ] **Step 1: Record the template audit and deviations**

Write the audit with the source slide count, A4 portrait size, slide 1 as the formal teaser, slide 2 as the icon asset page, and the exact inherited image anchors to replace:

```text
Slide 1 investment image anchors:
im/apc3mxkn, im/kvelsr2p, im/lwnm1w3a,
im/43q1ojid, im/32h0fe1s, im/i1ojm907

New bounded industry zone:
left=32, top=420, width=286, height=186
```

Record the intentional deviations: six source-image replacements, two new images inside the empty industry zone, and focused font-size increases only.

- [ ] **Step 2: Create the frame map**

Use two duplicate-slide entries. Slide 1 declares six `replace` targets, focused text `rewrite-and-reposition` targets, and two permitted `add` targets with explicit bounded zones; slide 2 uses `editTargets: []` and remains preserve-only.

```json
{
  "outputSlides": [
    {
      "outputSlide": 1,
      "sourceSlide": 1,
      "narrativeRole": "content teaser with industry evidence and investment highlights",
      "reuseMode": "duplicate-slide",
      "editTargets": [
        {"action":"replace","sourceElementIds":["im/apc3mxkn","im/kvelsr2p","im/lwnm1w3a","im/43q1ojid","im/32h0fe1s","im/i1ojm907"]},
        {"action":"rewrite-and-reposition","sourceElementIds":["sh/k3yl0zql","sh/432dwn6l","sh/298ju94j","sh/balw3i5s","sh/ozm9gfex","sh/yxcfexoj","sh/idcja1kv","sh/e9g32543","sh/lo7ql0ne","sh/fm14nml4","sh/kr69oze5"]},
        {"action":"add","newPrimitiveAllowed":true,"zone":{"left":32,"top":420,"width":244,"height":94},"reason":"Place the slide-2 manufacturing icon in existing blank industry-overview space.","mustNotOverlapInherited":true},
        {"action":"add","newPrimitiveAllowed":true,"zone":{"left":104,"top":508,"width":124,"height":92},"reason":"Place the slide-2 global-network icon in existing blank industry-overview space.","mustNotOverlapInherited":true}
      ]
    },
    {
      "outputSlide": 2,
      "sourceSlide": 2,
      "narrativeRole": "icon asset reference",
      "reuseMode": "duplicate-slide",
      "editTargets": []
    }
  ],
  "omittedSourceSlides": []
}
```

- [ ] **Step 3: Validate and prepare the starter deck**

Run:

```bash
node "$SKILL_DIR/template_following_scripts/prepare_template_starter_deck.mjs" \
  --workspace "$TMP_DIR" \
  --pptx "$SOURCE_PPTX" \
  --map "$TMP_DIR/template-frame-map.json" \
  --out "$TMP_DIR/template-starter.pptx" \
  --preview-dir "$TMP_DIR/template-starter-preview" \
  --layout-dir "$TMP_DIR/template-starter-layout" \
  --contact-sheet "$TMP_DIR/template-starter-contact-sheet.png"
```

Expected: validation passes, two starter slides render, and slide 2 is unchanged.

### Task 2: Replace and place icons, then adjust font sizes

**Files:**
- Create: `.ppt-review.v4e0AV/build_nasn_teaser.mjs`
- Create: `.ppt-review.v4e0AV/trimmed-icons/*.png`
- Create: `.ppt-review.v4e0AV/final-preview/*.png`
- Create: `/Users/a1-6/Desktop/财通实习成果/ipo概览/NASN_A4_Teaser_BlueGold_字号图片优化版.pptx`

**Interfaces:**
- Consumes: `.ppt-review.v4e0AV/template-starter.pptx`, icon assets `image14.png` through `image22.png`, and stable slide-1 inspect anchors.
- Produces: the final PPTX, per-slide PNGs, layout JSON, and montage.

- [ ] **Step 1: Write structural precondition checks**

The module must import the starter deck, assert exactly two slides, and resolve every target before editing:

```js
const requiredAnchors = [
  "im/apc3mxkn", "im/kvelsr2p", "im/lwnm1w3a",
  "im/43q1ojid", "im/32h0fe1s", "im/i1ojm907",
  "sh/k3yl0zql", "sh/432dwn6l", "sh/298ju94j",
  "sh/balw3i5s", "sh/ozm9gfex"
];
if (presentation.slides.items.length !== 2) throw new Error("Expected two slides");
for (const id of requiredAnchors) {
  if (!presentation.resolve(id)) throw new Error(`Missing required anchor: ${id}`);
}
```

- [ ] **Step 2: Trim the eight selected slide-2 icon assets**

Use `sharp(input).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(output)` for:

```js
const iconAssets = {
  industryFactory: "image17.png",
  industryGlobal: "image14.png",
  customerTeam: "image22.png",
  expertPath: "image19.png",
  researchCertification: "image16.png",
  modularChassis: "image15.png",
  technologyNetwork: "image21.png",
  solutionPortfolio: "image18.png"
};
```

Expected: transparent padding is removed without changing the icon artwork.

- [ ] **Step 3: Replace the six inherited investment-highlight images**

Use `image.replace({ blob, contentType: "image/png", fit: "contain", alt })`, then set the frames below:

```js
const highlightIcons = [
  ["im/apc3mxkn", "customerTeam",           { left: 318, top: 666, width: 54, height: 40 }],
  ["im/kvelsr2p", "expertPath",             { left: 689, top: 666, width: 54, height: 40 }],
  ["im/lwnm1w3a", "researchCertification", { left: 318, top: 744, width: 54, height: 40 }],
  ["im/43q1ojid", "modularChassis",         { left: 689, top: 744, width: 54, height: 40 }],
  ["im/32h0fe1s", "technologyNetwork",      { left: 318, top: 823, width: 54, height: 40 }],
  ["im/i1ojm907", "solutionPortfolio",      { left: 689, top: 823, width: 54, height: 40 }]
];
```

Set `fit = "contain"`, `crop = { left:0, top:0, right:0, bottom:0 }`, `geometry = "rect"`, `rotation = 0`, and `lockAspectRatio = true` for every replacement.

- [ ] **Step 4: Add two icons to the industry-overview whitespace**

Add the trimmed manufacturing and global-network icons to slide 1:

```js
slide1.images.add({
  blob: await readImage("industryFactory"), contentType: "image/png",
  alt: "Manufacturing capability and safety", fit: "contain",
  position: { left: 42, top: 430, width: 234, height: 82 }
});
slide1.images.add({
  blob: await readImage("industryGlobal"), contentType: "image/png",
  alt: "Global market network", fit: "contain",
  position: { left: 116, top: 510, width: 108, height: 88 }
});
```

- [ ] **Step 5: Apply focused typography changes**

Use the single-property setter `shape.text.fontSize = value` so existing colors, weights, alignment, and font families remain intact:

```js
const fontSizeMap = {
  "sh/k3yl0zql": 24,
  "sh/432dwn6l": 13.3,
  "sh/298ju94j": 13.3,
  "sh/balw3i5s": 13.3,
  "sh/ozm9gfex": 13.3,
  "sh/yxcfexoj": 11.2,
  "sh/idcja1kv": 11.2,
  "sh/e9g32543": 11.2,
  "sh/lo7ql0ne": 11.2,
  "sh/fm14nml4": 11.2,
  "sh/kr69oze5": 11.2,
  "sh/wn6dc7eh": 7.2,
  "sh/5sfepcfe": 7.2,
  "sh/1cvuxc7e": 7.2,
  "sh/ozmd8r65": 7.2,
  "sh/ul4vaxgb": 7.0,
  "sh/3qxwn2x8": 7.0,
  "sh/zadcv2p8": 7.0,
  "sh/mx4v6hoz": 7.0
};
```

- [ ] **Step 6: Export the deck and evidence**

Render both slides and montage through artifact-tool, export each layout JSON, and save the PPTX through `PresentationFile.exportPptx(presentation)`.

Expected: the final output exists at the exact output path, and the original file modification time is unchanged.

### Task 3: Verify layout and template fidelity

**Files:**
- Inspect: `.ppt-review.v4e0AV/final-preview/slide-01.png`
- Inspect: `.ppt-review.v4e0AV/final-preview/slide-02.png`
- Inspect: `.ppt-review.v4e0AV/final-layout/*.json`
- Inspect: `/Users/a1-6/Desktop/财通实习成果/ipo概览/NASN_A4_Teaser_BlueGold_字号图片优化版.pptx`

**Interfaces:**
- Consumes: the final PPTX and artifacts from Task 2.
- Produces: verified evidence that the requested edit is complete.

- [ ] **Step 1: Run automated slide checks**

Run:

```bash
python "$SKILL_DIR/container_tools/slides_test.py" "$FINAL_PPTX"
node "$SKILL_DIR/template_following_scripts/check_template_fidelity.mjs" \
  --workspace "$TMP_DIR" \
  --starter-pptx "$TMP_DIR/template-starter.pptx" \
  --final-pptx "$FINAL_PPTX" \
  --map "$TMP_DIR/template-frame-map.json" \
  --starter-layout-dir "$TMP_DIR/template-starter-layout" \
  --final-layout-dir "$TMP_DIR/final-layout" \
  --edit-dir "$TMP_DIR"
```

Expected: no unintended canvas overflow, missing inherited content, or unclassified fidelity changes.

- [ ] **Step 2: Inspect every slide at full size**

Check slide 1 for title wrapping, industry-icon/chart separation, six icon baselines, card containment, readable key text, and consistent right margins. Check slide 2 against the source render and confirm it is unchanged.

- [ ] **Step 3: Apply one polish iteration if required**

If any icon appears visually undersized because of aspect ratio, change only that icon frame while keeping the right edge at `372` for left cards or `743` for right cards. If a font wraps, reduce only that font by `0.3` and rerender.

- [ ] **Step 4: Final verification**

Re-render both slides, rerun both automated checks, and confirm the final file opens in PowerPoint and remains editable.
