const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildShowcase({ outputDir, entries }) {
  const ids = new Set();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`Duplicate showcase id: ${entry.id}`);
    ids.add(entry.id);
    if (!existsSync(join(outputDir, entry.image))) {
      throw new Error(`Missing screenshot: ${entry.image}`);
    }
  }

  const pageCount = entries.filter((entry) => entry.kind === "page").length;
  const panelCount = entries.filter((entry) => entry.kind === "panel").length;
  const categories = [...new Set(entries.map((entry) => entry.category))];
  const cards = entries
    .map(
      (entry, index) => `
        <article class="shot-card" data-kind="${escapeHtml(entry.kind)}" data-category="${escapeHtml(entry.category)}" data-index="${index}">
          <button class="shot-open" type="button" aria-label="放大查看 ${escapeHtml(entry.title)}">
            <img src="${escapeHtml(entry.image)}" alt="${escapeHtml(entry.title)}" loading="lazy">
          </button>
          <div class="shot-copy">
            <div class="shot-meta"><span>${entry.kind === "page" ? "完整界面" : "功能面板"}</span><span>${escapeHtml(entry.category)}</span></div>
            <h2>${escapeHtml(entry.title)}</h2>
            <p>${escapeHtml(entry.description)}</p>
          </div>
        </article>`
    )
    .join("");

  const filters = ["全部", "完整界面", "功能面板", ...categories]
    .map((label, index) => `<button type="button" class="filter${index === 0 ? " active" : ""}" data-filter="${escapeHtml(label)}">${escapeHtml(label)}</button>`)
    .join("");

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sublet Pipeline 产品展示</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='18' fill='%23006aff'/%3E%3Cpath d='M18 31 32 19l14 12v15H36V35h-8v11H18Z' fill='white'/%3E%3C/svg%3E">
  <style>
    :root { color-scheme: light; --ink:#10233f; --blue:#006aff; --line:#dce8f8; --muted:#60708a; --paper:#f5f9ff; }
    * { box-sizing: border-box; }
    body { margin:0; font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif; color:var(--ink); background:radial-gradient(circle at 8% 0%,#dcebff 0,transparent 27rem),var(--paper); }
    button { font:inherit; }
    .hero { padding:72px max(24px,calc((100vw - 1480px)/2)); border-bottom:1px solid var(--line); background:rgba(255,255,255,.72); backdrop-filter:blur(18px); }
    .brand { display:flex; align-items:center; gap:12px; font-weight:900; letter-spacing:-.02em; }
    .brand-mark { width:42px; height:42px; display:grid; place-items:center; color:white; border-radius:18px; background:linear-gradient(135deg,#006aff,#0c4598); box-shadow:0 16px 40px #006aff33; }
    .eyebrow { margin-top:54px; color:var(--blue); font-size:12px; font-weight:900; letter-spacing:.14em; text-transform:uppercase; }
    h1 { max-width:900px; margin:12px 0 18px; font-size:clamp(42px,7vw,90px); line-height:.95; letter-spacing:-.065em; }
    .lede { max-width:760px; margin:0; color:var(--muted); font-size:18px; line-height:1.7; font-weight:650; }
    .stats { display:flex; flex-wrap:wrap; gap:12px; margin-top:32px; }
    .stat { min-width:150px; padding:18px 20px; border:1px solid var(--line); border-radius:22px; background:white; }
    .stat strong { display:block; font-size:28px; }
    .stat span { color:var(--muted); font-size:13px; font-weight:750; }
    .toolbar { position:sticky; top:0; z-index:10; display:flex; gap:8px; overflow:auto; padding:14px max(24px,calc((100vw - 1480px)/2)); border-bottom:1px solid var(--line); background:#f8fbffed; backdrop-filter:blur(18px); }
    .filter { white-space:nowrap; border:1px solid var(--line); border-radius:999px; padding:10px 15px; color:var(--muted); background:white; font-weight:800; cursor:pointer; }
    .filter.active { border-color:var(--blue); color:white; background:var(--blue); }
    .gallery { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,390px),1fr)); gap:22px; max-width:1480px; margin:auto; padding:32px 24px 80px; }
    .shot-card { overflow:hidden; border:1px solid var(--line); border-radius:28px; background:white; box-shadow:0 22px 65px rgba(35,77,126,.09); }
    .shot-card[hidden] { display:none; }
    .shot-open { display:block; width:100%; height:310px; padding:0; border:0; background:#eaf2ff; cursor:zoom-in; overflow:hidden; }
    .shot-open img { width:100%; height:100%; object-fit:cover; object-position:top; transition:transform .35s ease; }
    .shot-open:hover img { transform:scale(1.018); }
    .shot-copy { padding:20px 22px 24px; }
    .shot-meta { display:flex; gap:8px; color:var(--blue); font-size:11px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }
    .shot-meta span+span:before { content:"/"; margin-right:8px; color:#9fb4d0; }
    h2 { margin:10px 0 7px; font-size:22px; letter-spacing:-.03em; }
    .shot-copy p { margin:0; color:var(--muted); line-height:1.55; font-weight:600; }
    dialog { width:min(94vw,1480px); max-height:94vh; padding:0; border:0; border-radius:26px; background:#0a1627; box-shadow:0 40px 120px #00142b88; }
    dialog::backdrop { background:#06101fda; backdrop-filter:blur(8px); }
    .modal-bar { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px 18px; color:white; }
    .modal-bar strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .modal-close { border:1px solid #ffffff33; border-radius:999px; padding:8px 12px; color:white; background:#ffffff14; cursor:pointer; }
    .modal-image { display:block; width:100%; max-height:calc(94vh - 58px); object-fit:contain; background:#0a1627; }
    @media (max-width:640px) { .hero{padding-top:40px;padding-bottom:44px}.eyebrow{margin-top:38px}.shot-open{height:240px}.gallery{padding-inline:14px}.toolbar{padding-inline:14px} }
  </style>
</head>
<body>
  <header class="hero">
    <div class="brand"><span class="brand-mark">⌂</span><span>Sublet Pipeline</span></div>
    <div class="eyebrow">Product experience archive · 2026</div>
    <h1>从找房到入住，完整看见每一步。</h1>
    <p class="lede">覆盖找房、收藏、申请、消息、租住进度与室友匹配，并将房东运营和管理员审核拆成独立工作台；同时包含桌面端、移动端与关键交互面板。</p>
    <div class="stats"><div class="stat"><strong>${pageCount}</strong><span>完整界面</span></div><div class="stat"><strong>${panelCount}</strong><span>功能面板</span></div><div class="stat"><strong>${entries.length}</strong><span>真实产品截图</span></div></div>
  </header>
  <nav class="toolbar" aria-label="展示筛选">${filters}</nav>
  <main class="gallery">${cards}</main>
  <dialog id="viewer"><div class="modal-bar"><strong id="viewer-title"></strong><button class="modal-close" type="button">关闭</button></div><img class="modal-image" alt=""></dialog>
  <script>
    const cards=[...document.querySelectorAll('.shot-card')];
    document.querySelectorAll('.filter').forEach(button=>button.addEventListener('click',()=>{
      document.querySelectorAll('.filter').forEach(item=>item.classList.toggle('active',item===button));
      const filter=button.dataset.filter;
      cards.forEach(card=>card.hidden=!(filter==='全部'||(filter==='完整界面'&&card.dataset.kind==='page')||(filter==='功能面板'&&card.dataset.kind==='panel')||card.dataset.category===filter));
    }));
    const viewer=document.querySelector('#viewer'); const viewerImage=viewer.querySelector('img'); const viewerTitle=document.querySelector('#viewer-title');
    document.querySelectorAll('.shot-open').forEach(button=>button.addEventListener('click',()=>{ const card=button.closest('.shot-card'); const image=button.querySelector('img'); viewerImage.src=image.src; viewerImage.alt=image.alt; viewerTitle.textContent=card.querySelector('h2').textContent; viewer.showModal(); }));
    document.querySelector('.modal-close').addEventListener('click',()=>viewer.close());
    viewer.addEventListener('click',event=>{ if(event.target===viewer) viewer.close(); });
  </script>
</body>
</html>`;

  writeFileSync(join(outputDir, "index.html"), html);
  return { pageCount, panelCount, imageCount: entries.length };
}

if (require.main === module) {
  const outputDir = process.argv[2];
  if (!outputDir) throw new Error("Usage: node tools/product-showcase-builder.js <output-directory>");
  const entries = JSON.parse(readFileSync(join(outputDir, "showcase.json"), "utf8"));
  const result = buildShowcase({ outputDir, entries });
  console.log(JSON.stringify(result));
}

module.exports = { buildShowcase };
