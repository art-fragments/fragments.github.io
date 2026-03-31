const flow = document.getElementById('flow');
let expandedId = null;
let isEnlarged = false;
const preloadCache = {};
let gridContainer = null;
let expandedEl = null;
let lastClickedGridItem = null;

function getIdx() {
  return items.findIndex(i => i.id === expandedId);
}

function preloadImage(src) {
  if (preloadCache[src]) return preloadCache[src];
  const promise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = () => resolve(src);
    img.src = src;
  });
  preloadCache[src] = promise;
  return promise;
}

function preloadNeighbors(idx) {
  [-1, 1].forEach(d => {
    const n = items[idx + d];
    if (n && n.type === 'image') preloadImage(n.full);
  });
}

function isDesktop() {
  return window.innerWidth > 1100;
}

// === Build grid once, never destroy ===

function buildGrid() {
  gridContainer = document.createElement('div');
  gridContainer.className = 'grid-section';

  items.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'grid-item' + (item.type === 'text' ? ' text-block' : '');
    div.dataset.itemId = item.id;
    div.style.animationDelay = `${i * 0.035}s`;

    if (item.type === 'image') {
      const src = isDesktop() ? item.thumb : item.full;
      div.innerHTML = `<img src="${src}" alt="${item.id}" loading="lazy">`;
      if (isDesktop()) {
        div.addEventListener('click', () => openFromGrid(item.id));
      }
    } else {
      div.innerHTML = `<div class="text-content">${item.text}</div>`;
      if (isDesktop()) {
        div.style.cursor = 'pointer';
        div.addEventListener('click', () => openFromGrid(item.id));
      }
    }

    gridContainer.appendChild(div);
  });

  flow.appendChild(gridContainer);
}

// === Expand / Close without rebuilding grid ===

function openFromGrid(id) {
  removeExpanded();

  expandedId = id;
  isEnlarged = false;
  history.replaceState(null, '', '#' + id);

  const item = items.find(i => i.id === id);
  if (!item) return;

  lastClickedGridItem = gridContainer.querySelector(`[data-item-id="${id}"]`);

  if (item.type === 'image') {
    expandedEl = createExpandedImage(item);
  } else {
    expandedEl = createExpandedText(item);
  }

  // Insert after grid
  gridContainer.after(expandedEl);

  requestAnimationFrame(() => {
    expandedEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  if (item.type === 'image') preloadNeighbors(getIdx());
}

function removeExpanded() {
  if (expandedEl) {
    expandedEl.remove();
    expandedEl = null;
  }
  lastClickedGridItem = null;
}

function closeExpanded() {
  const scrollTarget = lastClickedGridItem;
  removeExpanded();
  expandedId = null;
  isEnlarged = false;
  history.replaceState(null, '', window.location.pathname);

  if (scrollTarget) {
    requestAnimationFrame(() => {
      scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
}

// === Share button ===

function shareButtonHtml() {
  return `
    <button class="share-btn" title="Copy link">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
    </button>`;
}

function bindShareBtn(container, id) {
  const btn = container.querySelector('.share-btn');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const url = window.location.origin + window.location.pathname + '#' + id;
    navigator.clipboard.writeText(url).then(() => {
      btn.classList.add('copied');
      btn.setAttribute('title', 'Copied!');
      setTimeout(() => { btn.classList.remove('copied'); btn.setAttribute('title', 'Copy link'); }, 2000);
    });
  });
}

// === Detail metadata ===

function hasDetail(item) {
  return item.title || item.description || item.link;
}

function buildDetailHtml(item) {
  if (!hasDetail(item)) return '';
  let html = '';
  if (item.title) html += `<div class="detail-title">${item.title}</div>`;
  if (item.description) html += `<div class="detail-description">${item.description}</div>`;
  if (item.link) html += `<a class="detail-link" href="${item.link}" target="_blank">${item.link_text || 'View on kremenskii.art'} →</a>`;
  return html;
}

// === Create expanded elements ===

function createExpandedImage(item) {
  const idx = getIdx();
  const hasPrev = idx > 0;
  const hasNext = idx < items.length - 1;
  const el = document.createElement('div');
  el.className = 'expanded-photo';
  el.id = item.id;

  let metaHtml = (item.meta || '') + shareButtonHtml();
  let detailHtml = hasDetail(item)
    ? `<div class="detail-block">${buildDetailHtml(item)}</div>`
    : '<div class="detail-block" style="display:none"></div>';

  el.innerHTML = `
    <button class="close-btn" title="Close">&times;</button>
    <div class="viewer-row">
      <button class="nav-arrow" ${!hasPrev ? 'disabled' : ''} data-dir="prev">&#8592;</button>
      <div class="img-stage" id="img-stage">
        <img id="img-front" src="${item.full}" alt="${item.id}">
        <img id="img-back" class="img-back" src="" alt="">
      </div>
      <button class="nav-arrow" ${!hasNext ? 'disabled' : ''} data-dir="next">&#8594;</button>
    </div>
    <div class="meta-expanded">${metaHtml}</div>
    ${detailHtml}
  `;

  el.querySelector('.close-btn').addEventListener('click', (e) => { e.stopPropagation(); closeExpanded(); });
  bindShareBtn(el.querySelector('.meta-expanded'), item.id);

  const stage = el.querySelector('#img-stage');
  stage.addEventListener('click', (e) => {
    e.stopPropagation();
    isEnlarged = !isEnlarged;
    stage.classList.toggle('enlarged', isEnlarged);
  });

  rebindArrows(el, idx);
  return el;
}

function createExpandedText(item) {
  const idx = getIdx();
  const hasPrev = idx > 0;
  const hasNext = idx < items.length - 1;
  const el = document.createElement('div');
  el.className = 'expanded-text';
  el.id = item.id;
  el.innerHTML = `
    <button class="close-btn" title="Close">&times;</button>
    <div class="viewer-row">
      <button class="nav-arrow" ${!hasPrev ? 'disabled' : ''} data-dir="prev">&#8592;</button>
      <div class="text-content-large">${item.text}</div>
      <button class="nav-arrow" ${!hasNext ? 'disabled' : ''} data-dir="next">&#8594;</button>
    </div>
  `;
  el.querySelector('.close-btn').addEventListener('click', (e) => { e.stopPropagation(); closeExpanded(); });
  rebindArrows(el, idx);
  return el;
}

// === Arrow navigation ===

function navigateArrow(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;

  expandedId = id;
  isEnlarged = false;
  history.replaceState(null, '', '#' + id);

  const currentIsImage = expandedEl && expandedEl.classList.contains('expanded-photo');
  const nextIsImage = item.type === 'image';

  // If type changes (image↔text), replace the expanded element
  if (!nextIsImage || !currentIsImage) {
    const oldEl = expandedEl;
    expandedEl = nextIsImage ? createExpandedImage(item) : createExpandedText(item);
    if (oldEl) oldEl.replaceWith(expandedEl);
    if (nextIsImage) preloadNeighbors(getIdx());
    return;
  }

  // Image-to-image: crossfade
  const idx = getIdx();
  const stage = expandedEl.querySelector('.img-stage');
  const imgFront = expandedEl.querySelector('#img-front');
  const imgBack = expandedEl.querySelector('#img-back');

  if (!imgFront || !imgBack || !stage) return;

  stage.classList.remove('enlarged');
  preloadImage(item.full).then(() => {
    imgBack.src = item.full;
    imgBack.style.opacity = '1';
    imgFront.style.opacity = '0';
    setTimeout(() => {
      imgFront.src = item.full;
      imgFront.style.opacity = '1';
      imgBack.style.opacity = '0';

      expandedEl.id = item.id;

      const meta = expandedEl.querySelector('.meta-expanded');
      if (meta) {
        meta.innerHTML = (item.meta || '') + shareButtonHtml();
        bindShareBtn(meta, item.id);
      }

      const detailBlock = expandedEl.querySelector('.detail-block');
      if (detailBlock) {
        detailBlock.innerHTML = buildDetailHtml(item);
        detailBlock.style.display = hasDetail(item) ? 'block' : 'none';
      }

      rebindArrows(expandedEl, idx);
      preloadNeighbors(idx);
    }, 260);
  });
}

function rebindArrows(container, idx) {
  const prevBtn = container.querySelector('.nav-arrow[data-dir="prev"]');
  const nextBtn = container.querySelector('.nav-arrow[data-dir="next"]');
  if (prevBtn) {
    const n = prevBtn.cloneNode(true);
    prevBtn.replaceWith(n);
    n.disabled = idx <= 0;
    if (idx > 0) n.addEventListener('click', (e) => { e.stopPropagation(); navigateArrow(items[idx - 1].id); });
  }
  if (nextBtn) {
    const n = nextBtn.cloneNode(true);
    nextBtn.replaceWith(n);
    n.disabled = idx >= items.length - 1;
    if (idx < items.length - 1) n.addEventListener('click', (e) => { e.stopPropagation(); navigateArrow(items[idx + 1].id); });
  }
}

// === Keyboard ===

document.addEventListener('keydown', (e) => {
  if (!expandedId) return;
  const idx = getIdx();
  if (e.key === 'Escape') {
    if (isEnlarged) { isEnlarged = false; const s = document.getElementById('img-stage'); if (s) s.classList.remove('enlarged'); }
    else { closeExpanded(); }
  } else if (e.key === 'ArrowLeft' && idx > 0) { navigateArrow(items[idx - 1].id); }
  else if (e.key === 'ArrowRight' && idx < items.length - 1) { navigateArrow(items[idx + 1].id); }
});

// === Init ===

buildGrid();

// Hash navigation on load
const hash = window.location.hash.slice(1);
if (hash && isDesktop()) {
  const item = items.find(i => i.id === hash);
  if (item) {
    expandedId = item.id;
    lastClickedGridItem = gridContainer.querySelector(`[data-item-id="${hash}"]`);
    expandedEl = item.type === 'image' ? createExpandedImage(item) : createExpandedText(item);
    gridContainer.after(expandedEl);
    requestAnimationFrame(() => {
      expandedEl.scrollIntoView({ block: 'start' });
    });
  }
}

// Copy protection
document.addEventListener('contextmenu', (e) => {
  if (e.target.tagName === 'IMG') e.preventDefault();
});
document.addEventListener('dragstart', (e) => {
  if (e.target.tagName === 'IMG') e.preventDefault();
});
