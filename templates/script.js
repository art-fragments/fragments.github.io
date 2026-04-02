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
    div.className = 'grid-item entering' + (item.type === 'text' ? ' text-block' : '') + (item.type === 'video' ? ' video-block' : '');
    div.dataset.itemId = item.id;
    div.dataset.itemIndex = i;
    div.style.animationDelay = `${i * 0.035}s`;

    // Remove entering class after animation so re-parenting doesn't re-trigger it
    div.addEventListener('animationend', () => {
      div.classList.remove('entering');
      div.style.animationDelay = '';
    }, { once: true });

    if (item.type === 'video') {
      const src = item.full || item.thumb;
      div.innerHTML = `<video src="${src}" autoplay muted loop playsinline preload="metadata"></video>`;
      if (isDesktop()) {
        div.addEventListener('click', () => openFromGrid(item.id));
      }
      // Mobile: show meta under video if available
      if (!isDesktop() && hasDetail(item)) {
        div.innerHTML += buildMobileDetail(item);
      }
    } else if (item.type === 'audio') {
      div.innerHTML = buildAudioBlock(item);
    } else if (item.type === 'image') {
      const src = isDesktop() ? item.thumb : item.full;
      div.innerHTML = `<img src="${src}" alt="${item.id}" loading="lazy">`;
      if (isDesktop()) {
        div.addEventListener('click', () => openFromGrid(item.id));
      }
      // Mobile: show meta under image if available
      if (!isDesktop() && hasDetail(item)) {
        div.innerHTML += buildMobileDetail(item);
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

function buildMobileDetail(item) {
  let html = '<div class="mobile-detail">';
  if (item.title) html += `<div class="mobile-detail-title">${item.title}</div>`;
  if (item.description) html += `<div class="mobile-detail-desc">${item.description}</div>`;
  if (item.link) html += `<a class="mobile-detail-link" href="${item.link}" target="_blank">${item.link_text || 'View on kremenskii.art'} →</a>`;
  html += `<button class="mobile-share-btn" data-id="${item.id}">copy link</button>`;
  html += '</div>';
  return html;
}

function buildAudioBlock(item) {
  const label = item.title || '';
  return `
    <div class="audio-player" data-src="${item.full}">
      <div class="audio-btn">▶</div>
      ${label ? `<div class="audio-label">${label}</div>` : ''}
    </div>`;
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

  if (item.type === 'image' || item.type === 'video') {
    expandedEl = createExpandedImage(item);
  } else if (item.type === 'text') {
    expandedEl = createExpandedText(item);
  } else {
    // audio or unknown — don't expand
    return;
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
  const isVideo = item.type === 'video';

  let metaHtml = (item.meta || '') + shareButtonHtml();
  let detailHtml = hasDetail(item)
    ? `<div class="detail-block">${buildDetailHtml(item)}</div>`
    : '<div class="detail-block" style="display:none"></div>';

  let mediaHtml;
  if (isVideo) {
    mediaHtml = `
      <video id="media-front" src="${item.full}" autoplay muted loop playsinline></video>`;
  } else {
    mediaHtml = `
      <img id="img-front" src="${item.full}" alt="${item.id}">
      <img id="img-back" class="img-back" src="" alt="">`;
  }

  el.innerHTML = `
    <button class="close-btn" title="Close">&times;</button>
    <div class="viewer-row">
      <button class="nav-arrow" ${!hasPrev ? 'disabled' : ''} data-dir="prev">&#8592;</button>
      <div class="img-stage" id="img-stage">
        ${mediaHtml}
      </div>
      <button class="nav-arrow" ${!hasNext ? 'disabled' : ''} data-dir="next">&#8594;</button>
    </div>
    <div class="meta-expanded">${metaHtml}</div>
    ${detailHtml}
  `;

  el.querySelector('.close-btn').addEventListener('click', (e) => { e.stopPropagation(); closeExpanded(); });
  bindShareBtn(el.querySelector('.meta-expanded'), item.id);

  const stage = el.querySelector('#img-stage');
  if (!isVideo) {
    stage.addEventListener('click', (e) => {
      e.stopPropagation();
      isEnlarged = !isEnlarged;
      stage.classList.toggle('enlarged', isEnlarged);
    });
  }

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

  // Skip audio items when navigating
  if (item.type === 'audio') return;

  expandedId = id;
  isEnlarged = false;
  history.replaceState(null, '', '#' + id);

  const idx = getIdx();
  const currentIsMedia = expandedEl && expandedEl.classList.contains('expanded-photo');
  const nextIsMedia = item.type === 'image' || item.type === 'video';
  const nextIsText = item.type === 'text';

  // If type changes, or going to/from video, replace expanded element
  const currentHasImgFront = expandedEl && expandedEl.querySelector('#img-front');
  const nextIsImage = item.type === 'image';
  const canCrossfade = currentIsMedia && nextIsImage && currentHasImgFront;

  if (!canCrossfade) {
    const oldEl = expandedEl;
    if (nextIsMedia) {
      expandedEl = createExpandedImage(item);
    } else if (nextIsText) {
      expandedEl = createExpandedText(item);
    } else {
      return;
    }
    if (oldEl) {
      oldEl.replaceWith(expandedEl);
    }
    requestAnimationFrame(() => {
      expandedEl.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    if (nextIsImage) preloadNeighbors(idx);
    return;
  }

  // Image-to-image: crossfade in place
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
    expandedEl = (item.type === 'image' || item.type === 'video') ? createExpandedImage(item) : createExpandedText(item);
    renderSplit(idx);
    requestAnimationFrame(() => {
      if (expandedEl) expandedEl.scrollIntoView({ block: 'start' });
    });
  }
}

// Copy protection
document.addEventListener('contextmenu', (e) => {
  if (e.target.tagName === 'IMG' || e.target.tagName === 'VIDEO') e.preventDefault();
});
document.addEventListener('dragstart', (e) => {
  if (e.target.tagName === 'IMG' || e.target.tagName === 'VIDEO') e.preventDefault();
});

// Mobile share buttons (event delegation)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.mobile-share-btn');
  if (!btn) return;
  e.stopPropagation();
  const id = btn.dataset.id;
  const url = window.location.origin + window.location.pathname + '#' + id;
  navigator.clipboard.writeText(url).then(() => {
    btn.textContent = 'copied!';
    setTimeout(() => { btn.textContent = 'copy link'; }, 2000);
  });
});

// Audio player (event delegation)
let currentAudio = null;
let currentAudioBtn = null;
document.addEventListener('click', (e) => {
  const player = e.target.closest('.audio-player');
  if (!player) return;
  const src = player.dataset.src;
  const btn = player.querySelector('.audio-btn');
  if (!src || !btn) return;

  if (currentAudio && currentAudioBtn === btn) {
    // Toggle off
    currentAudio.pause();
    currentAudio = null;
    currentAudioBtn = null;
    btn.textContent = '▶';
    btn.classList.remove('playing');
    return;
  }

  // Stop previous
  if (currentAudio) {
    currentAudio.pause();
    if (currentAudioBtn) {
      currentAudioBtn.textContent = '▶';
      currentAudioBtn.classList.remove('playing');
    }
  }

  const audio = new Audio(src);
  audio.play();
  btn.textContent = '■';
  btn.classList.add('playing');
  currentAudio = audio;
  currentAudioBtn = btn;

  audio.addEventListener('ended', () => {
    btn.textContent = '▶';
    btn.classList.remove('playing');
    currentAudio = null;
    currentAudioBtn = null;
  });
});

// === Scroll position persistence ===
const SCROLL_KEY = 'fragments_scroll_pos';

// Restore scroll position on load (only if no hash navigation)
if (!hash) {
  try {
    const saved = localStorage.getItem(SCROLL_KEY);
    if (saved) {
      const pos = parseInt(saved, 10);
      // Wait for images to start loading, then restore
      requestAnimationFrame(() => {
        setTimeout(() => { window.scrollTo(0, pos); }, 100);
      });
    }
  } catch (e) {}
}

// Save scroll position periodically
let scrollTimer = null;
window.addEventListener('scroll', () => {
  if (scrollTimer) clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    try {
      localStorage.setItem(SCROLL_KEY, String(window.scrollY));
    } catch (e) {}
  }, 200);
}, { passive: true });
