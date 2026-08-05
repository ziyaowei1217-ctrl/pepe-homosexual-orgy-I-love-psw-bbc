from __future__ import annotations

import csv
from pathlib import Path

import matplotlib as mpl
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import FancyBboxPatch, Patch


OUT_DIR = Path(__file__).resolve().parent
DATA_PATH = OUT_DIR / "figure_source_data.csv"
OUTPUT_BASE = OUT_DIR / "line_control_industry_china_full_series_ppt_transparent"


mpl.rcParams.update(
    {
        "font.family": "sans-serif",
        "font.sans-serif": [
            "Hiragino Sans GB",
            "PingFang HK",
            "Heiti SC",
            "Arial Unicode MS",
            "DejaVu Sans",
        ],
        "svg.fonttype": "none",
        "pdf.fonttype": 42,
        "font.size": 7,
        "axes.labelsize": 7,
        "axes.linewidth": 0.7,
        "xtick.labelsize": 6,
        "ytick.labelsize": 6.2,
        "legend.frameon": False,
        "figure.facecolor": "none",
    }
)


COLORS = {
    "navy": "#17365D",
    "ink": "#1C2938",
    "muted": "#687A8C",
    "grid": "#DDE5EA",
    "steer": "#8796A4",
    "brake": "#3F8EAE",
    "suspension": "#D99A36",
    "controller": "#8871B2",
    "localization": "#C55C50",
}


def read_data(path: Path):
    datasets: dict[str, list[dict[str, object]]] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            row["year"] = int(row["year"])
            row["value"] = float(row["value"])
            datasets.setdefault(row["dataset"], []).append(row)
    return datasets


def series(rows, metric):
    selected = sorted((row for row in rows if row["metric"] == metric), key=lambda row: row["year"])
    years = np.array([int(row["year"]) for row in selected], dtype=int)
    values = np.array([float(row["value"]) for row in selected], dtype=float)
    return years, values


def scale_to_lane(values, low, high):
    span = values.max() - values.min()
    if span <= 0:
        return np.full_like(values, (low + high) / 2)
    return low + (values - values.min()) / span * (high - low)


data = read_data(DATA_PATH)
years, china_total = series(data["china_by_product"], "total")
_, china_steer = series(data["china_by_product"], "steer_by_wire")
_, china_brake = series(data["china_by_product"], "brake_by_wire")
_, china_suspension = series(data["china_by_product"], "suspension_by_wire")
_, china_controller = series(data["china_by_product"], "motion_controller")
domestic_years, domestic_sales = series(data["domestic_brake_by_wire"], "sales_volume")
_, localization = series(data["domestic_brake_by_wire"], "localization_rate")

china_components = china_steer + china_brake + china_suspension + china_controller

assert years.tolist() == list(range(2020, 2031))
assert domestic_years.tolist() == list(range(2024, 2031))
assert len(china_total) == 11
assert len(domestic_sales) == 7 and len(localization) == 7
assert np.allclose(china_components, china_total, atol=0.11)


fig, ax = plt.subplots(figsize=(7.2047, 4.0526))  # 183 mm × 103 mm
fig.subplots_adjust(left=0.085, right=0.975, top=0.90, bottom=0.07)
fig.patch.set_alpha(0)
ax.set_facecolor("none")

legend_handles = [
    Patch(color=COLORS["steer"], label="线控转向"),
    Patch(color=COLORS["brake"], label="线控制动"),
    Patch(color=COLORS["suspension"], label="线控悬架"),
    Patch(color=COLORS["controller"], label="运动控制器"),
]
fig.legend(
    handles=legend_handles,
    loc="upper left",
    bbox_to_anchor=(0.075, 0.985),
    ncol=4,
    fontsize=5.8,
    handlelength=1.15,
    handletextpad=0.35,
    columnspacing=1.15,
)

x = np.arange(len(years), dtype=float)
ax.set_xlim(-0.68, 10.85)
ax.set_ylim(-80, 260)
ax.set_ylabel("中国线控市场规模（人民币十亿元）", color=COLORS["muted"], labelpad=4)
ax.set_yticks([0, 50, 100, 150, 200, 250])
ax.grid(axis="y", color=COLORS["grid"], linewidth=0.6, zorder=0)
ax.set_axisbelow(True)
ax.spines[["top", "right", "left", "bottom"]].set_visible(False)
ax.tick_params(axis="x", bottom=False, labelbottom=False)
ax.tick_params(axis="y", length=0, colors=COLORS["muted"])
ax.axhline(0, color="#AEB9C4", linewidth=0.7, zorder=2)

ax.axvline(4.5, ymin=80 / 340, ymax=1, color=COLORS["grid"], linewidth=0.7, linestyle=(0, (2, 2)), zorder=1)
ax.text(4.62, 255, "预测区间", ha="left", va="top", fontsize=5.6, color=COLORS["muted"])

bar_width = 0.72
stack = [
    (china_steer, COLORS["steer"], "线控转向"),
    (china_brake, COLORS["brake"], "线控制动"),
    (china_suspension, COLORS["suspension"], "线控悬架"),
    (china_controller, COLORS["controller"], "运动控制器"),
]
bottom = np.zeros_like(china_total)
segment_bottoms: dict[str, np.ndarray] = {}
for values, color, label in stack:
    segment_bottoms[label] = bottom.copy()
    ax.bar(
        x,
        values,
        width=bar_width,
        bottom=bottom,
        color=color,
        edgecolor="white",
        linewidth=0.4,
        zorder=3,
    )
    bottom += values

for idx, value in enumerate(china_total):
    ax.text(
        x[idx],
        value + 3.0,
        f"{value:.1f}",
        ha="center",
        va="bottom",
        fontsize=5.2,
        fontweight="bold",
        color=COLORS["ink"],
        zorder=7,
    )

for idx, year in enumerate(years):
    label = str(year) if year <= 2024 else f"{year}E"
    ax.text(x[idx], -7.2, label, ha="center", va="center", fontsize=5.6, color=COLORS["ink"])

ax.text(
    1.65,
    242,
    "2020–2024 CAGR 35.4%",
    ha="center",
    va="center",
    fontsize=5.8,
    fontweight="bold",
    color=COLORS["navy"],
    bbox={"boxstyle": "round,pad=0.28", "facecolor": "none", "edgecolor": COLORS["grid"], "linewidth": 0.5},
    zorder=8,
)
ax.text(
    7.45,
    242,
    "2024–2030E CAGR 19.8%",
    ha="center",
    va="center",
    fontsize=5.8,
    fontweight="bold",
    color=COLORS["navy"],
    bbox={"boxstyle": "round,pad=0.28", "facecolor": "none", "edgecolor": COLORS["grid"], "linewidth": 0.5},
    zorder=8,
)

idx_2030 = 10
direct_labels = [
    (china_steer, "线控转向", "转向"),
    (china_brake, "线控制动", "制动"),
    (china_suspension, "线控悬架", "悬架"),
]
for values, key, short in direct_labels:
    ax.text(
        x[idx_2030],
        segment_bottoms[key][idx_2030] + values[idx_2030] / 2,
        f"{short} {values[idx_2030]:.1f}",
        ha="center",
        va="center",
        fontsize=5.0,
        fontweight="bold",
        color="white",
        zorder=7,
    )
ax.text(
    x[idx_2030] + 0.39,
    china_total[idx_2030] - china_controller[idx_2030] / 2,
    f"控制器 {china_controller[idx_2030]:.1f}",
    ha="left",
    va="center",
    fontsize=5.0,
    fontweight="bold",
    color=COLORS["controller"],
    zorder=7,
)

# Domestic brake-by-wire substitution: complete 2024–2030E data on a non-primary-axis lane.
band = FancyBboxPatch(
    (3.55, -77),
    7.15,
    58,
    boxstyle="round,pad=0.02,rounding_size=0.035",
    facecolor="none",
    edgecolor="#CADAE5",
    linewidth=0.8,
    zorder=8,
)
ax.add_patch(band)
ax.text(
    3.72,
    -24.5,
    "线控制动国产替代（2024–2030E｜非主轴比例）",
    ha="left",
    va="center",
    fontsize=5.5,
    fontweight="bold",
    color=COLORS["ink"],
    zorder=10,
)

domestic_x = domestic_years - 2020
sales_y = scale_to_lane(domestic_sales, -49, -34)
localization_y = scale_to_lane(localization, -68, -52)
ax.plot(domestic_x, sales_y, color=COLORS["brake"], linewidth=1.2, marker="o", markersize=2.8, zorder=11)
ax.plot(domestic_x, localization_y, color=COLORS["localization"], linewidth=1.2, marker="o", markersize=2.8, zorder=11)
ax.text(3.70, -35.5, "销量", ha="left", va="center", fontsize=5.0, fontweight="bold", color=COLORS["brake"], zorder=11)
ax.text(3.70, -60.0, "国产化率", ha="left", va="center", fontsize=5.0, fontweight="bold", color=COLORS["localization"], zorder=11)

for idx, xpos in enumerate(domestic_x):
    ax.text(
        xpos,
        sales_y[idx] + 2.4,
        f"{domestic_sales[idx]:.1f}",
        ha="center",
        va="bottom",
        fontsize=5.0,
        fontweight="bold",
        color=COLORS["brake"],
        zorder=12,
    )
    ax.text(
        xpos,
        localization_y[idx] - 2.5,
        f"{localization[idx]:.1%}",
        ha="center",
        va="top",
        fontsize=5.0,
        fontweight="bold",
        color=COLORS["localization"],
        zorder=12,
    )
ax.text(
    8.35,
    -24.5,
    "销量 CAGR 27.3%",
    ha="right",
    va="center",
    fontsize=5.0,
    fontweight="bold",
    color=COLORS["brake"],
    zorder=12,
)

fig.savefig(f"{OUTPUT_BASE}.svg", bbox_inches="tight", pad_inches=0.03, transparent=True)
fig.savefig(f"{OUTPUT_BASE}.pdf", bbox_inches="tight", pad_inches=0.03, transparent=True)
fig.savefig(
    f"{OUTPUT_BASE}.tiff",
    dpi=600,
    bbox_inches="tight",
    pad_inches=0.03,
    transparent=True,
    pil_kwargs={"compression": "tiff_lzw"},
)
fig.savefig(f"{OUTPUT_BASE}.png", dpi=300, bbox_inches="tight", pad_inches=0.03, transparent=True)
plt.close(fig)

print(
    {
        "market_years": years.tolist(),
        "market_points": len(years),
        "penetration_years": domestic_years.tolist(),
        "penetration_points": len(domestic_years),
        "china_2020_2030": [float(china_total[0]), float(china_total[-1])],
        "single_axes": True,
        "transparent": True,
    }
)
