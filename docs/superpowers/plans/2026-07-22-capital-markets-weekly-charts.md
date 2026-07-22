# Capital Markets Weekly Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate data-grounded vector charts for all 22 placeholders in the supplied capital-markets weekly TeX report, integrate them into a new TeX file, and deliver a visually verified PDF.

**Architecture:** A JavaScript extractor reads the four `.xlsx` workbooks through `@oai/artifact-tool` and writes one normalized JSON snapshot. A Python renderer turns that snapshot into consistently styled vector PDF charts, and a focused TeX integration script replaces only the 19 known placeholder calls in a copy of the source document. The existing source TeX and all source workbooks remain unchanged.

**Tech Stack:** Bundled Node.js, `@oai/artifact-tool` 2.8.6+, bundled Python 3, matplotlib, pytest, XeLaTeX through the bundled `latex-compile` helper, Poppler PDF rendering for visual QA.

## Global Constraints

- Use only the four user-provided workbooks; do not fetch additional data.
- Use only rows where `qc_flag=OK`.
- Keep missing values blank; never infer zeroes.
- Replace absent VIX, southbound flow, buybacks, turnover, Hang Seng China Enterprises Index, oil term structure, and US real yield only with the approved nearest-data alternatives.
- Keep percentage returns, yield/spread levels, and basis-point changes on separate axes or panels.
- Output chart files as vector PDF with stable English filenames.
- Preserve the original TeX file and create a new chart-complete TeX file.
- Use the report palette: Caitong blue `#003F6B`, gold `#B4932F`, positive green `#027A48`, negative red `#B42318`, muted gray `#73777E`, light gray `#F4F6F8`.
- Percentages display to two decimals; rate and spread changes display in bp.
- Final PDF must compile without missing-image errors and pass page-by-page visual inspection.

---

### Task 1: Normalize the Four Workbook Inputs

**Files:**
- Create: `tools/weekly_report_charts/extract_data.mjs`
- Create: `tests/weekly_report_charts/test_snapshot_schema.py`
- Produce: `work/weekly_report_charts/market_snapshot.json`

**Interfaces:**
- Consumes: Four absolute `.xlsx` paths passed after `--inputs`, and an output path passed through `--output`.
- Produces: JSON object `{meta, equity_indices, sectors, fixed_income, money_market, commodities, fx, divergence}` with snake-case keys and numeric values preserved as numbers.

- [ ] **Step 1: Write the failing schema test**

```python
import json
from pathlib import Path

SNAPSHOT = Path("work/weekly_report_charts/market_snapshot.json")

def test_snapshot_contains_required_series():
    data = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    assert {"标普500", "费城半导体指数", "恒生指数", "创业板指"} <= {
        row["name_cn"] for row in data["equity_indices"]
    }
    assert {"WTI", "BRENT", "COMEX_GOLD"} <= {
        row["series_code"] for row in data["commodities"]
    }
    assert all(row["qc_flag"] == "OK" for rows in data.values() if isinstance(rows, list) for row in rows if "qc_flag" in row)
```

- [ ] **Step 2: Run the test and verify the snapshot is absent**

Run: `python -m pytest tests/weekly_report_charts/test_snapshot_schema.py -q`

Expected: FAIL because `work/weekly_report_charts/market_snapshot.json` does not exist.

- [ ] **Step 3: Implement the artifact-tool extractor**

Use `FileBlob.load()` and `SpreadsheetFile.importXlsx()` for each input workbook. Read each used range, locate the header row by exact required header names, convert rows to objects, filter `qc_flag !== "OK"`, and write UTF-8 JSON. Required sheet mappings:

```javascript
const mappings = {
  "02_equity_indices": "equity_indices",
  "03_equity_sectors": "sectors",
  "sector_divergence": "divergence",
  "fixed_income": "fixed_income",
  "money_market": "money_market",
  "commodities": "commodities",
  "foreign_exchange": "fx",
};
```

Normalize `index_name_cn` or `name_cn` to `name_cn`, retain `series_code`, `market`, `latest_value`, `weekly_change`, `mtd_change`, `ytd_change`, `latest_date`, `weekly_base_date`, `level_unit`, `change_unit`, and `qc_flag`. Deduplicate US GICS rows by preferring `03_equity_sectors` over the standalone GICS workbook while recording the standalone workbook in `meta.sources`.

- [ ] **Step 4: Run the extractor**

Run:

```bash
node tools/weekly_report_charts/extract_data.mjs \
  --output work/weekly_report_charts/market_snapshot.json \
  --inputs "/Users/a1-6/Documents/market data/交付文件/资本市场周报数据_20260720/01_全球股票指数.xlsx" \
           "/Users/a1-6/Documents/market data/交付文件/资本市场周报数据_20260720/02_A股港股美股行业板块分化.xlsx" \
           "/Users/a1-6/Documents/market data/交付文件/资本市场周报数据_20260720/03_全球GICS行业板块.xlsx" \
           "/Users/a1-6/Documents/market data/交付文件/资本市场周报数据_20260720/04_固定收益外汇商品及事件.xlsx"
```

Expected: prints row counts by normalized section and creates the JSON snapshot.

- [ ] **Step 5: Run schema test and numerical spot checks**

Run: `python -m pytest tests/weekly_report_charts/test_snapshot_schema.py -q`

Expected: PASS. Also inspect values for Brent weekly `15.91%`, SOX weekly `-9.97%`, HIBOR 1M weekly about `+8.89bp`, and US 10Y weekly `-1bp`.

- [ ] **Step 6: Commit normalized extraction**

```bash
git add tools/weekly_report_charts/extract_data.mjs tests/weekly_report_charts/test_snapshot_schema.py
git commit -m "feat: normalize weekly market workbooks"
```

### Task 2: Render the Complete Chart Set

**Files:**
- Create: `tools/weekly_report_charts/build_charts.py`
- Create: `tests/weekly_report_charts/test_build_charts.py`
- Produce: `/Users/a1-6/Downloads/资本市场周报_20260717_assets/*.pdf`

**Interfaces:**
- Consumes: `market_snapshot.json`, `--output-dir`, and a chart manifest declared in the renderer.
- Produces: exactly 22 non-empty vector PDF assets with filenames matching the TeX replacement map.

- [ ] **Step 1: Write the failing renderer tests**

```python
from tools.weekly_report_charts.build_charts import color_for_value, chart_manifest

def test_color_semantics():
    assert color_for_value(1.0) == "#027A48"
    assert color_for_value(-1.0) == "#B42318"
    assert color_for_value(0.0) == "#73777E"

def test_manifest_has_all_placeholders():
    manifest = chart_manifest()
    assert len(manifest) == 22
    assert len({item.filename for item in manifest}) == 22
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `python -m pytest tests/weekly_report_charts/test_build_charts.py -q`

Expected: FAIL because the renderer module does not exist.

- [ ] **Step 3: Implement shared chart primitives**

Implement focused functions with the following signatures:

```python
def color_for_value(value: float) -> str:
    return "#027A48" if value > 0 else "#B42318" if value < 0 else "#73777E"

def format_pct(value: float) -> str:
    return f"{value:+.2%}"

def format_bp(value: float) -> str:
    return f"{value:+.0f}bp"

def sorted_barh(ax, labels: list[str], values: list[float], unit: str) -> None:
    ordered = sorted(zip(labels, values), key=lambda item: item[1])
    names, numbers = zip(*ordered)
    ax.barh(names, numbers, color=[color_for_value(value) for value in numbers])
    formatter = format_pct if unit == "pct" else format_bp
    for index, value in enumerate(numbers):
        ax.text(value, index, f" {formatter(value)}", va="center", fontsize=7)

def grouped_bar(ax, labels: list[str], series: dict[str, list[float]], unit: str) -> None:
    import numpy as np
    width = 0.8 / len(series)
    x = np.arange(len(labels))
    for offset, (name, values) in enumerate(series.items()):
        ax.bar(x + offset * width, values, width=width, label=name)
    ax.set_xticks(x + width * (len(series) - 1) / 2, labels)

def curve_compare(ax, tenors: list[str], latest: list[float], prior: list[float]) -> None:
    ax.plot(tenors, prior, color="#73777E", marker="o", label="一周前")
    ax.plot(tenors, latest, color="#003F6B", marker="o", label="最新")
    ax.legend(frameon=False)

def metric_table(ax, rows: list[tuple[str, str, str]]) -> None:
    ax.axis("off")
    ax.table(cellText=rows, colLabels=["指标", "最新", "周度变化"], loc="center", cellLoc="center")
```

Set matplotlib to PDF output, embed TrueType fonts, use Noto Sans CJK SC where available, remove top/right spines, use thin light-gray zero lines, and keep labels inside the figure bounds.

- [ ] **Step 4: Implement the 19-item manifest and renderers**

Use these stable filenames:

```text
01_cross_asset_weekly.pdf
02_macro_energy_transmission.pdf
03_macro_us_curve.pdf
04_macro_risk_confirmation.pdf
05_us_sector_weekly.pdf
06_us_indices_weekly.pdf
07_us_style_proxy.pdf
08_us_risk_table.pdf
09_hk_sector_weekly.pdf
10_hk_indices_comparison.pdf
11_hk_leaders_laggards.pdf
12_hk_liquidity_table.pdf
13_cn_sector_weekly.pdf
14_cn_indices_weekly.pdf
15_cn_leaders_laggards.pdf
16_cn_breadth_table.pdf
17_fi_fx_weekly.pdf
18_us_curve_detail.pdf
19_cn_hk_rates.pdf
20_commodities_weekly.pdf
21_oil_horizons.pdf
22_gold_dxy_us10y.pdf
```

- [ ] **Step 5: Render and verify every PDF asset**

Run:

```bash
python tools/weekly_report_charts/build_charts.py \
  --snapshot work/weekly_report_charts/market_snapshot.json \
  --output-dir "/Users/a1-6/Downloads/资本市场周报_20260717_assets"
```

Expected: renderer reports 22/22 assets, every file is larger than 2 KB, and no warning reports a missing required series.

- [ ] **Step 6: Run renderer tests**

Run: `python -m pytest tests/weekly_report_charts/test_build_charts.py -q`

Expected: PASS.

- [ ] **Step 7: Commit chart rendering**

```bash
git add tools/weekly_report_charts/build_charts.py tests/weekly_report_charts/test_build_charts.py
git commit -m "feat: render weekly market report charts"
```

### Task 3: Replace All TeX Placeholders in a Copy

**Files:**
- Create: `tools/weekly_report_charts/integrate_tex.py`
- Create: `tests/weekly_report_charts/test_integrate_tex.py`
- Read: `/Users/a1-6/Downloads/资本市场周报_20260717_完整版_含WeekAhead.tex`
- Produce: `/Users/a1-6/Downloads/资本市场周报_20260717_完整版_含WeekAhead_图表版.tex`

**Interfaces:**
- Consumes: source TeX path, output TeX path, asset directory, and exact replacement map keyed by the full placeholder command text.
- Produces: UTF-8 TeX with no remaining `\placeholder{` or `\smallplaceholder{` calls and exactly 22 chart asset references.

- [ ] **Step 1: Write the failing integration tests**

```python
from tools.weekly_report_charts.integrate_tex import replace_placeholders

def test_replacement_is_exact_and_complete():
    source = r"A\placeholder{67mm}{示例}B"
    mapping = {r"\placeholder{67mm}{示例}": "example.pdf"}
    result = replace_placeholders(source, mapping, "assets")
    assert r"\placeholder{" not in result
    assert r"\includegraphics" in result
    assert "example.pdf" in result

def test_unknown_placeholder_fails():
    source = r"\smallplaceholder{43mm}{未知}"
    try:
        replace_placeholders(source, {}, "assets")
    except ValueError as exc:
        assert "unmapped placeholder" in str(exc)
    else:
        raise AssertionError("expected ValueError")
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `python -m pytest tests/weekly_report_charts/test_integrate_tex.py -q`

Expected: FAIL because the integration module does not exist.

- [ ] **Step 3: Implement exact, count-checked replacement**

Implement:

```python
def replacement_tex(filename: str, height_mm: int, width_ratio: float) -> str:
    return rf"\includegraphics[width={width_ratio:.3f}\linewidth,height={height_mm}mm,keepaspectratio]{{资本市场周报_20260717_assets/{filename}}}"

def replace_placeholders(source: str, mapping: dict[str, str], asset_dir: str) -> str:
    result = source
    for placeholder, replacement in mapping.items():
        if result.count(placeholder) != 1:
            raise ValueError(f"expected one occurrence: {placeholder}")
        result = result.replace(placeholder, replacement, 1)
    if "\\placeholder{" in result or "\\smallplaceholder{" in result:
        raise ValueError("unmapped placeholder remains")
    return result
```

Retain the existing paragraph and vertical-space commands surrounding each placeholder. Replace the sentence claiming charts are still pending with a neutral data-as-of note.

- [ ] **Step 4: Generate the chart-complete TeX copy**

Run:

```bash
python tools/weekly_report_charts/integrate_tex.py \
  --source "/Users/a1-6/Downloads/资本市场周报_20260717_完整版_含WeekAhead.tex" \
  --output "/Users/a1-6/Downloads/资本市场周报_20260717_完整版_含WeekAhead_图表版.tex" \
  --asset-dir "/Users/a1-6/Downloads/资本市场周报_20260717_assets"
```

Expected: reports `22 placeholders replaced`; source file checksum remains unchanged.

- [ ] **Step 5: Verify TeX references and integration tests**

Run:

```bash
rg -n -F '\placeholder{' "/Users/a1-6/Downloads/资本市场周报_20260717_完整版_含WeekAhead_图表版.tex"
rg -n -F '\smallplaceholder{' "/Users/a1-6/Downloads/资本市场周报_20260717_完整版_含WeekAhead_图表版.tex"
python -m pytest tests/weekly_report_charts/test_integrate_tex.py -q
```

Expected: both searches return no matches and tests PASS.

- [ ] **Step 6: Commit TeX integration tooling**

```bash
git add tools/weekly_report_charts/integrate_tex.py tests/weekly_report_charts/test_integrate_tex.py
git commit -m "feat: integrate charts into weekly report tex"
```

### Task 4: Compile and Perform Visual QA

**Files:**
- Read: `/Users/a1-6/Downloads/资本市场周报_20260717_完整版_含WeekAhead_图表版.tex`
- Produce: `/Users/a1-6/Downloads/资本市场周报_20260717_完整版_含WeekAhead_图表版.pdf`
- Produce temporary QA renders under: `work/weekly_report_charts/rendered_pages/`

**Interfaces:**
- Consumes: integrated TeX plus 22 PDF chart assets.
- Produces: compiled PDF and a verification report listing page count, missing references, overfull boxes, and visual inspection status.

- [ ] **Step 1: Compile with the approved LaTeX helper**

Run:

```bash
python3 /Users/a1-6/.codex/plugins/cache/openai-bundled/latex/0.2.4/skills/latex-compile/scripts/compile_latex.py \
  "/Users/a1-6/Downloads/资本市场周报_20260717_完整版_含WeekAhead_图表版.tex" \
  --compiler texlive --engine xelatex
```

Expected: exit code 0 and PDF emitted next to the TeX source or in the helper-reported build directory.

- [ ] **Step 2: Check compilation diagnostics**

Search the log for `LaTeX Error`, missing files, `Overfull \hbox`, and `Overfull \vbox`. Fix missing files and material overflow; tolerate only negligible sub-point box warnings that do not affect rendered layout.

- [ ] **Step 3: Render every PDF page to PNG**

Run: `pdftoppm -png -r 150 <final.pdf> work/weekly_report_charts/rendered_pages/page`

Expected: one PNG per PDF page with no render errors.

- [ ] **Step 4: Inspect every page visually**

Check all pages for clipped chart labels, unreadable legends, chart/table overlap, blank figures, inconsistent colors, and unexpected pagination. For defects, adjust only the affected chart margins, font size, or TeX image height and recompile.

- [ ] **Step 5: Run final numerical and file checks**

Verify:

```text
- 22/22 placeholders replaced
- 22/22 referenced assets exist and are non-empty
- Brent weekly = +15.91%
- SOX weekly = -9.97%
- Hang Seng weekly = +1.60%
- ChiNext weekly = -10.78%
- US 10Y weekly = -1bp
- HY OAS weekly = +1bp
- final PDF opens and all pages render
```

- [ ] **Step 6: Invoke verification-before-completion and report deliverables**

Run the required verification skill, then link only the final chart-complete TeX, final PDF, and chart asset directory in the user handoff. Do not claim success until the compile and rendered-page checks have fresh passing evidence.
