const flow = document.getElementById('flow');
let expandedId = null;
let isEnlarged = false;
const preloadCache = {};

// DOM references
let gridBefore = null;   // grid-section with items before expanded
let gridAfter = null;    // grid-section with items after expanded
let expandedEl = null;   // the expanded view element
let allGridItems = [];   // all grid-item DOM elements, built once
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

// === Build all grid items once ===

function init() {
  allGridItems = items.map((item, i) => {
    const div = document.createElement('div');
    div.className = 'grid-item' + (item.type === 'text' ? ' text-block' : '');
    div.dataset.itemId = item.id;
    div.dataset.itemIndex = i;
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

    return div;
  });

  renderFlat();
}

// === Render: flat grid (no expanded) ===

function renderFlat() {
  flow.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'grid-section';
  allGridItems.forEach(el => grid.appendChild(el));
  flow.appendChild(grid);
  gridBefore = grid;
  gridAfter = null;
}

// === Render: split grid around expanded item ===

function renderSplit(itemIndex) {
  flow.innerHTML = '';

  // Grid before
  gridBefore = document.createElement('div');
  gridBefore.className = 'grid-section';
  for (let i = 0; i < itemIndex; i++) {
    gridBefore.appendChild(allGridItems[i]);
  }
  flow.appendChild(gridBefore);

  // Expanded element (already created)
  if (expandedEl) {
    flow.appendChild(expandedEl);
  }

  // Grid after
  gridAfter = document.createElement('div');
  gridAfter.className = 'grid-section';
  for (let i = itemIndex + 1; i < allGridItems.length; i++) {
    gridAfter.appendChild(allGridItems[i]);
  }
  flow.appendChild(gridAfter);
}

// === Open / Close ===

function openFromGrid(id) {
  if (expandedEl) {
    removeExpanded();
  }

  expandedId = id;
  isEnlarged = false;
  history.replaceState(null, '', '#' + id);

  const idx = getIdx();
  const item = items[idx];
  if (!item) return;

  lastClickedGridItem = allGridItems[idx];

  if (item.type === 'image') {
    expandedEl = createExpandedImage(item);
  } else {
    expandedEl = createExpandedText(item);
  }

  renderSplit(idx);

  requestAnimationFrame(() => {
    if (expandedEl) expandedEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  if (item.type === 'image') preloadNeighbors(idx);
}

function removeExpanded() {
  if (expandedEl) {
    expandedEl.remove();
    expandedEl = null;
  }
}

function closeExpanded() {
  const scrollTarget = lastClickedGridItem;
  removeExpanded();
  expandedId = null;
  isEnlarged = false;
  lastClickedGridItem = null;
  history.replaceState(null, '', window.location.pathname);

  renderFlat();

  if (scrollTarget) {
    requestAnimationFrame(() => {
      scrollTarget.scrollIntoView({ behavior: 'instant', block: 'center' });
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

  const idx = getIdx();
  const currentIsImage = expandedEl && expandedEl.classList.contains('expanded-photo');
  const nextIsImage = item.type === 'image';

  // If type changes (image↔text), replace expanded element in place (no re-split)
  if (!nextIsImage || !currentIsImage) {
    const oldEl = expandedEl;
    expandedEl = nextIsImage ? createExpandedImage(item) : createExpandedText(item);
    if (oldEl) {
      oldEl.replaceWith(expandedEl);
    }
    requestAnimationFrame(() => {
      expandedEl.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    if (nextIsImage) preloadNeighbors(idx);
    return;
  }

  // Image-to-image: crossfade in place, NO re-split
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

init();

// Hash navigation on load
const hash = window.location.hash.slice(1);
if (hash && isDesktop()) {
  const idx = items.findIndex(i => i.id === hash);
  if (idx !== -1) {
    const item = items[idx];
    expandedId = item.id;
    lastClickedGridItem = allGridItems[idx];
    expandedEl = item.type === 'image' ? createExpandedImage(item) : createExpandedText(item);
    renderSplit(idx);
    requestAnimationFrame(() => {
      if (expandedEl) expandedEl.scrollIntoView({ block: 'start' });
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
