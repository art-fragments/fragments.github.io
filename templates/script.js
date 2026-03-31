const flow = document.getElementById('flow');
let expandedId = null;
let isEnlarged = false;
const preloadCache = {};

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

function openFromGrid(id) {
  expandedId = id;
  isEnlarged = false;
  history.replaceState(null, '', '#' + id);
  render();
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const idx = getIdx();
  if (items[idx] && items[idx].type === 'image') preloadNeighbors(idx);
}

function navigateArrow(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;

  expandedId = id;
  isEnlarged = false;
  history.replaceState(null, '', '#' + id);

  if (item.type === 'text') {
    render();
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return;
  }

  const idx = getIdx();
  const stage = document.querySelector('.img-stage');
  const imgFront = document.getElementById('img-front');
  const imgBack = document.getElementById('img-back');

  if (!imgFront || !imgBack || !stage) {
    render();
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return;
  }

  stage.classList.remove('enlarged');
  preloadImage(item.full).then(() => {
    imgBack.src = item.full;
    imgBack.style.opacity = '1';
    imgFront.style.opacity = '0';
    setTimeout(() => {
      imgFront.src = item.full;
      imgFront.style.opacity = '1';
      imgBack.style.opacity = '0';

      const expanded = document.querySelector('.expanded-photo');
      if (expanded) expanded.id = item.id;

      // Update meta
      const meta = document.querySelector('.meta-expanded');
      if (meta) {
        let metaHtml = item.meta || '';
        metaHtml += shareButtonHtml();
        meta.innerHTML = metaHtml;
        bindShareBtn(meta, item.id);
      }

      // Update detail block
      const detailBlock = document.querySelector('.detail-block');
      if (detailBlock) {
        detailBlock.innerHTML = buildDetailHtml(item);
        detailBlock.style.display = hasDetail(item) ? 'block' : 'none';
      }

      const prevBtn = document.querySelector('.nav-arrow[data-dir="prev"]');
      const nextBtn = document.querySelector('.nav-arrow[data-dir="next"]');
      if (prevBtn) prevBtn.disabled = idx <= 0;
      if (nextBtn) nextBtn.disabled = idx >= items.length - 1;
      rebindArrows(idx);
      preloadNeighbors(idx);
    }, 260);
  });
}

function rebindArrows(idx) {
  const prevBtn = document.querySelector('.nav-arrow[data-dir="prev"]');
  const nextBtn = document.querySelector('.nav-arrow[data-dir="next"]');
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

function closeExpanded() {
  expandedId = null;
  isEnlarged = false;
  history.replaceState(null, '', window.location.pathname);
  render();
}

function isDesktop() {
  return window.innerWidth > 1100;
}

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

function render() {
  flow.innerHTML = '';

  if (!isDesktop()) {
    // Mobile/tablet: simple feed
    const section = document.createElement('div');
    section.className = 'grid-section';
    items.forEach((item, i) => {
      const el = makeGridItem(item, i);
      section.appendChild(el);
    });
    flow.appendChild(section);
    return;
  }

  // Desktop: interactive grid with inline expand
  let gridItems = [];

  function flushGrid() {
    if (!gridItems.length) return;
    const section = document.createElement('div');
    section.className = 'grid-section';
    gridItems.forEach((el, i) => { el.style.animationDelay = `${i * 0.035}s`; section.appendChild(el); });
    flow.appendChild(section);
    gridItems = [];
  }

  items.forEach((item) => {
    if (item.id === expandedId) {
      flushGrid();
      if (item.type === 'image') {
        buildExpanded(item);
      } else {
        buildExpandedText(item);
      }
    } else {
      gridItems.push(makeGridItem(item, gridItems.length));
    }
  });
  flushGrid();
}

function makeGridItem(item, index) {
  const div = document.createElement('div');
  div.className = 'grid-item' + (item.type === 'text' ? ' text-block' : '');
  div.style.animationDelay = `${index * 0.035}s`;

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
}

function buildExpanded(item) {
  const idx = getIdx();
  const hasPrev = idx > 0;
  const hasNext = idx < items.length - 1;
  const el = document.createElement('div');
  el.className = 'expanded-photo';
  el.id = item.id;

  let metaHtml = (item.meta || '') + shareButtonHtml();
  let detailHtml = hasDetail(item) ? `<div class="detail-block">${buildDetailHtml(item)}</div>` : '<div class="detail-block" style="display:none"></div>';

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
  flow.appendChild(el);
  el.querySelector('.close-btn').addEventListener('click', (e) => { e.stopPropagation(); closeExpanded(); });
  rebindArrows(idx);
  bindShareBtn(el.querySelector('.meta-expanded'), item.id);

  const stage = el.querySelector('#img-stage');
  stage.addEventListener('click', (e) => {
    e.stopPropagation();
    isEnlarged = !isEnlarged;
    stage.classList.toggle('enlarged', isEnlarged);
  });
  preloadNeighbors(idx);
}

function buildExpandedText(item) {
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
  flow.appendChild(el);
  el.querySelector('.close-btn').addEventListener('click', (e) => { e.stopPropagation(); closeExpanded(); });
  rebindArrows(idx);
}

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (!expandedId) return;
  const idx = getIdx();
  if (e.key === 'Escape') {
    if (isEnlarged) { isEnlarged = false; const s = document.getElementById('img-stage'); if (s) s.classList.remove('enlarged'); }
    else { closeExpanded(); }
  } else if (e.key === 'ArrowLeft' && idx > 0) { navigateArrow(items[idx - 1].id); }
  else if (e.key === 'ArrowRight' && idx < items.length - 1) { navigateArrow(items[idx + 1].id); }
});

// Hash navigation
const hash = window.location.hash.slice(1);
if (hash) {
  const item = items.find(i => i.id === hash);
  if (item && isDesktop()) expandedId = item.id;
}
render();
if (hash) {
  requestAnimationFrame(() => {
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ block: 'start' });
  });
}

// Copy protection
document.addEventListener('contextmenu', (e) => {
  if (e.target.tagName === 'IMG') e.preventDefault();
});
document.addEventListener('dragstart', (e) => {
  if (e.target.tagName === 'IMG') e.preventDefault();
});
