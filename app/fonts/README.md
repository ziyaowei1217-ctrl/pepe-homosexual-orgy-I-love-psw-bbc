# psw fonts

Self-hosted fonts from the psw design system, licensed under the SIL Open Font License 1.1.

| Font | Files | Used for | License |
| --- | --- | --- | --- |
| 资源圆体 Resource Han Rounded CN Bold | `public/fonts/psw/rounded-bold-*.woff2`, split from `design/psw/fonts/psw-rounded-bold.woff2` (GB2312 level 1) | Titles and buttons (`font-rounded`; serves every bold weight) | `design/psw/fonts/OFL-ResourceHanRounded.txt` |
| 资源圆体 Resource Han Rounded CN Heavy | `public/fonts/psw/slogan-heavy.woff2`, only the slogan's characters | The home slogan (`font-slogan`) | `design/psw/fonts/OFL-ResourceHanRounded.txt` |
| Nunito variable (200–1000), Latin | `app/fonts/nunito-variable.woff2` (via `next/font`) | Prices, dates and other numbers (`font-display`, `font-num`) | `OFL-Nunito.txt` |

## How the rounded font loads

The full Bold font is about 650 KB. `design/psw/fonts/subset.py` splits it into a core file with every character the
UI copy uses (about 150 KB) and 16 small files for the rest, and writes `app/psw-fonts.css` with one `@font-face` per
file and its `unicode-range`. A browser downloads a file only when the page shows one of its characters, so most pages
load just the core file. Re-run the script after changing UI copy or the slogan:

```sh
pip install fonttools brotli
python3 design/psw/fonts/subset.py
```

Body text and trust details use the system sans (PingFang SC / Microsoft YaHei / Noto Sans SC). Characters outside the
rounded files fall back to it.
