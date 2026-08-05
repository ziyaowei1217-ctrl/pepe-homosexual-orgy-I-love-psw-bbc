# China Line-Control Industry Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a China-only, full-series line-control industry chart with a transparent background for direct PowerPoint insertion.

**Architecture:** A dedicated Python/matplotlib script reads the existing normalized CSV, validates all required annual observations, and builds one integrated axes. The upper region is a four-category China market stacked bar chart; the lower non-primary-axis band carries domestic brake-by-wire sales and localization trends.

**Tech Stack:** Python 3, matplotlib, NumPy, CSV, SVG/PNG/PDF/TIFF export.

## Global Constraints

- Preserve all China market observations for 2020–2030E and all domestic-substitution observations for 2024–2030E.
- Remove global-market, other-region, and China-global-share data and annotations.
- Keep the canvas and annotation fills transparent.
- Preserve editable SVG text and export a transparent 300-dpi PNG for PowerPoint.
- Retain necessary legend, units, forecast marker, CAGR labels, and the non-primary-axis note.

---

### Task 1: Build the China-only figure source

**Files:**
- Create: `outputs/industry_chart/make_china_only_full_series_figure.py`
- Read: `outputs/industry_chart/figure_source_data.csv`

**Interfaces:**
- Consumes: CSV rows with `dataset`, `metric`, `year`, and `value` columns.
- Produces: four aligned 2020–2030E product arrays, a China total array, and two aligned 2024–2030E domestic-substitution arrays.

- [ ] **Step 1: Create explicit integrity assertions**

```python
assert years.tolist() == list(range(2020, 2031))
assert domestic_years.tolist() == list(range(2024, 2031))
assert np.allclose(china_steer + china_brake + china_suspension + china_controller, china_total, atol=0.11)
```

- [ ] **Step 2: Run the unfinished source and confirm the integrity gate is exercised**

Run: `python3 outputs/industry_chart/make_china_only_full_series_figure.py`

Expected before plotting is complete: the script reaches the validated arrays and then exits with a missing-figure/output error.

- [ ] **Step 3: Implement the single-axes China composition**

Implement four stacked bar segments in this order: line-control steering, brake-by-wire, line-control suspension, and motion controller. Label every bar with the China total, use only China CAGR boxes, place a dashed vertical forecast divider between 2024 and 2025E, and retain the seven-point domestic-substitution band below zero with the note `非主轴比例`.

- [ ] **Step 4: Export the PowerPoint-ready bundle**

```python
fig.patch.set_alpha(0)
ax.set_facecolor("none")
fig.savefig(f"{output_base}.svg", bbox_inches="tight", transparent=True)
fig.savefig(f"{output_base}.png", dpi=300, bbox_inches="tight", transparent=True)
fig.savefig(f"{output_base}.pdf", bbox_inches="tight", transparent=True)
fig.savefig(f"{output_base}.tiff", dpi=600, bbox_inches="tight", transparent=True)
```

- [ ] **Step 5: Run the script and verify its data summary**

Run: `python3 outputs/industry_chart/make_china_only_full_series_figure.py`

Expected: `market_points` equals `11`, `penetration_points` equals `7`, and `china_2020_2030` equals `[22.4, 222.8]`.

### Task 2: Validate the final exports

**Files:**
- Validate: `outputs/industry_chart/make_china_only_full_series_figure.py`
- Inspect: `outputs/industry_chart/line_control_industry_china_full_series_ppt_transparent.png`
- Inspect: `outputs/industry_chart/line_control_industry_china_full_series_ppt_transparent.svg`

**Interfaces:**
- Consumes: final plotting script and its exports.
- Produces: deterministic source-preflight evidence, transparency evidence, and a final visual QA decision.

- [ ] **Step 1: Run strict source preflight**

Run: `python3 /Users/a1-6/.codex/skills/nature-figure/scripts/validate_figure.py outputs/industry_chart/make_china_only_full_series_figure.py --strict`

Expected: zero failures and zero warnings.

- [ ] **Step 2: Verify transparent PNG pixels and editable SVG text**

```bash
python3 -c "from PIL import Image; im=Image.open('outputs/industry_chart/line_control_industry_china_full_series_ppt_transparent.png'); print(im.getchannel('A').getextrema())"
rg -c '<text' outputs/industry_chart/line_control_industry_china_full_series_ppt_transparent.svg
```

Expected: alpha minimum `0`, alpha maximum `255`, and SVG text count greater than `0`.

- [ ] **Step 3: Inspect the final-size PNG**

Confirm visually that no global/other-region marks remain, all 11 China bars and seven domestic-substitution observations are visible, and no labels overlap or clip.

- [ ] **Step 4: Commit the reproducible source**

```bash
git add outputs/industry_chart/make_china_only_full_series_figure.py
git commit -m "feat: add China-only line-control industry chart"
```
