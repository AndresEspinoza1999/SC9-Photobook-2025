import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

const PHOTOS_PER_PAGE = 4;

const monthLabel = document.getElementById('month-label');
const pageLabel = document.getElementById('page-label');
const pageGrid = document.getElementById('page-grid');
const pageEl = document.getElementById('page');
const pageIndicators = document.getElementById('page-indicators');
const prevBtn = document.getElementById('prev-page');
const nextBtn = document.getElementById('next-page');
const photoTemplate = document.getElementById('photo-template');
const placeholderTemplate = document.getElementById('placeholder-template');

const lightbox = document.getElementById('lightbox');
const lightboxBackdrop = document.getElementById('lightbox-backdrop');
const lightboxImage = document.getElementById('lightbox-image');
const lightboxCaption = document.getElementById('lightbox-caption');
const lightboxNotes = document.getElementById('lightbox-notes');
const lightboxPrev = document.getElementById('lightbox-prev');
const lightboxNext = document.getElementById('lightbox-next');
const lightboxClose = document.getElementById('lightbox-close');

let app;
let db;

const monthState = months.map(() => ({ photos: [], loaded: false }));
let pages = [];
let currentPageIndex = 0;
let activeLightbox = null;
let unsubscribeAll = null;

function isConfigReady(config) {
  if (!config) return false;
  return Object.values(config).every(
    (value) => typeof value === 'string' && value.trim().length > 0 && !value.includes('YOUR_')
  );
}

function reportMissingConfigScript() {
  if (window.firebaseConfig) return;
  console.error(
    'firebase-config.js was not loaded. Check the hosting path (for GitHub Pages, ensure /SC9-Photobook-2025/firebase-config.js exists).'
  );
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(timestamp.toDate ? timestamp.toDate() : timestamp);
}

function deriveMonthIndex(photo) {
  const monthValue = photo.month;

  if (typeof monthValue === 'number') {
    if (monthValue >= 0 && monthValue <= 11) return monthValue;
    if (monthValue >= 1 && monthValue <= 12) return monthValue - 1;
  }

  if (typeof monthValue === 'string') {
    const trimmed = monthValue.trim();
    const parsed = parseInt(trimmed, 10);

    if (!Number.isNaN(parsed)) {
      if (parsed >= 0 && parsed <= 11) return parsed;
      if (parsed >= 1 && parsed <= 12) return parsed - 1;
    }

    const byName = months.findIndex((name) => name.toLowerCase() === trimmed.toLowerCase());
    if (byName >= 0) return byName;
  }

  if (photo.createdAt?.toDate || photo.createdAt instanceof Date) {
    const date = photo.createdAt.toDate ? photo.createdAt.toDate() : photo.createdAt;
    if (date instanceof Date && !Number.isNaN(date.getMonth())) return date.getMonth();
  }

  return null;
}

function subscribeToPhotos() {
  if (unsubscribeAll) return;

  const photosRef = collection(db, 'photos');
  const q = query(photosRef, orderBy('createdAt', 'desc'));

  unsubscribeAll = onSnapshot(
    q,
    (snapshot) => {
      monthState.forEach((state) => {
        state.photos = [];
        state.loaded = true;
      });

      snapshot.docs.forEach((doc) => {
        const data = { id: doc.id, ...doc.data() };
        const monthIndex = deriveMonthIndex(data);
        if (monthIndex === null) return;
        monthState[monthIndex].photos.push(data);
      });

      rebuildPages();
    },
    (error) => {
      console.error('Failed to load photos', error);
      monthLabel.textContent = 'Unable to load photos';
      pageLabel.textContent = '';
      pageGrid.innerHTML = '<p class="placeholder">Could not load photos. Please try again later.</p>';
    }
  );
}

function rebuildPages() {
  const previousMonth = pages[currentPageIndex]?.monthIndex ?? 0;
  const previousPageNumber = pages[currentPageIndex]?.pageNumber ?? 0;

  pages = [];

  months.forEach((_, monthIndex) => {
    const state = monthState[monthIndex];
    const photos = state.photos || [];

    if (!photos.length) {
      pages.push({
        monthIndex,
        pageNumber: 0,
        totalPages: 1,
        photos: [],
        total: 0
      });
      return;
    }

    const totalPages = Math.ceil(photos.length / PHOTOS_PER_PAGE);
    for (let page = 0; page < totalPages; page += 1) {
      const start = page * PHOTOS_PER_PAGE;
      const slice = photos.slice(start, start + PHOTOS_PER_PAGE);
      pages.push({
        monthIndex,
        pageNumber: page,
        totalPages,
        photos: slice.map((photo, idx) => ({ ...photo, absoluteIndex: start + idx })),
        total: photos.length
      });
    }
  });

  if (!pages.length) return;

  const fallbackIndex = Math.min(currentPageIndex, pages.length - 1);
  const matchIndex = pages.findIndex(
    (p) => p.monthIndex === previousMonth && p.pageNumber === previousPageNumber
  );
  currentPageIndex = matchIndex >= 0 ? matchIndex : fallbackIndex;
  renderPage();
}

function renderPage(direction = 'next') {
  const pageData = pages[currentPageIndex];
  if (!pageData) return;

  const monthName = months[pageData.monthIndex];
  monthLabel.textContent = monthName;
  pageLabel.textContent = `Page ${pageData.pageNumber + 1} of ${pageData.totalPages}`;

  pageGrid.innerHTML = '';

  const turnClass = direction === 'prev' ? 'turn-prev' : 'turn-next';
  pageEl.classList.remove('turn-next', 'turn-prev');
  void pageEl.offsetWidth;
  pageEl.classList.add(turnClass);

  if (!pageData.photos.length) {
    const placeholderNode = placeholderTemplate.content.cloneNode(true);
    pageGrid.appendChild(placeholderNode);
  } else {
    pageData.photos.forEach((photo) => {
      const node = photoTemplate.content.cloneNode(true);
      const frame = node.querySelector('.photo__frame');
      const img = node.querySelector('img');
      const caption = node.querySelector('.photo__caption');
      const notes = node.querySelector('.photo__notes');

      img.src = photo.downloadURL;
      img.alt = photo.notes || `Photo from ${monthName}`;

      frame.setAttribute('role', 'button');
      frame.tabIndex = 0;
      frame.addEventListener('click', () => openLightbox(pageData.monthIndex, photo.absoluteIndex));
      frame.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault();
          openLightbox(pageData.monthIndex, photo.absoluteIndex);
        }
      });

      const who = photo.photographer ? ` · ${photo.photographer}` : '';
      const when = photo.createdAt ? ` — ${formatDate(photo.createdAt)}` : '';
      caption.textContent = `${monthName}${who}${when}`;

      if (photo.notes) {
        notes.textContent = photo.notes;
      } else {
        notes.remove();
      }

      pageGrid.appendChild(node);
    });
  }

  renderIndicators();
  syncNavButtons();
}

function renderIndicators() {
  pageIndicators.innerHTML = '';
  pages.forEach((p, idx) => {
    const indicator = document.createElement('button');
    indicator.type = 'button';
    indicator.title = `${months[p.monthIndex]} page ${p.pageNumber + 1}`;
    if (idx === currentPageIndex) indicator.classList.add('active');
    indicator.addEventListener('click', () => navigateToPage(idx, idx > currentPageIndex ? 'next' : 'prev'));
    pageIndicators.appendChild(indicator);
  });
}

function syncNavButtons() {
  prevBtn.disabled = currentPageIndex === 0;
  nextBtn.disabled = currentPageIndex >= pages.length - 1;
}

function navigateToPage(targetIndex, direction) {
  currentPageIndex = Math.max(0, Math.min(targetIndex, pages.length - 1));
  renderPage(direction);
}

function handlePageDelta(delta) {
  const nextIndex = Math.min(Math.max(currentPageIndex + delta, 0), pages.length - 1);
  if (nextIndex === currentPageIndex) return;
  navigateToPage(nextIndex, delta > 0 ? 'next' : 'prev');
}

function findPhoto(monthIndex, absoluteIndex) {
  const state = monthState[monthIndex];
  return state?.photos?.[absoluteIndex];
}

function openLightbox(monthIndex, absoluteIndex) {
  const photo = findPhoto(monthIndex, absoluteIndex);
  if (!photo) return;

  activeLightbox = { monthIndex, absoluteIndex };
  updateLightbox();
  document.body.classList.add('no-scroll');
  lightbox.classList.add('open');
  lightboxBackdrop.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
  lightboxClose.focus();
}

function closeLightbox() {
  activeLightbox = null;
  document.body.classList.remove('no-scroll');
  lightbox.classList.remove('open');
  lightboxBackdrop.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
}

function updateLightbox() {
  if (!activeLightbox) return;
  const photo = findPhoto(activeLightbox.monthIndex, activeLightbox.absoluteIndex);
  if (!photo) {
    closeLightbox();
    return;
  }

  const monthName = months[activeLightbox.monthIndex];
  lightboxImage.src = photo.downloadURL;
  lightboxImage.alt = photo.notes || `Photo from ${monthName}`;

  const who = photo.photographer ? ` · ${photo.photographer}` : '';
  const when = photo.createdAt ? ` — ${formatDate(photo.createdAt)}` : '';
  lightboxCaption.textContent = `${monthName}${who}${when}`;

  if (photo.notes) {
    lightboxNotes.textContent = photo.notes;
    lightboxNotes.style.display = 'block';
  } else {
    lightboxNotes.textContent = '';
    lightboxNotes.style.display = 'none';
  }

  const total = monthState[activeLightbox.monthIndex].photos.length;
  lightboxPrev.disabled = activeLightbox.absoluteIndex === 0;
  lightboxNext.disabled = activeLightbox.absoluteIndex >= total - 1;
}

function changeLightboxPhoto(delta) {
  if (!activeLightbox) return;
  const total = monthState[activeLightbox.monthIndex].photos.length;
  if (!total) return;

  const nextIndex = Math.min(
    Math.max(activeLightbox.absoluteIndex + delta, 0),
    total - 1
  );
  activeLightbox.absoluteIndex = nextIndex;
  updateLightbox();
}

function bindEvents() {
  prevBtn.addEventListener('click', () => handlePageDelta(-1));
  nextBtn.addEventListener('click', () => handlePageDelta(1));

  document.addEventListener('keydown', (evt) => {
    const modalOpen = lightbox.classList.contains('open');
    if (modalOpen) {
      if (evt.key === 'Escape') {
        closeLightbox();
      } else if (evt.key === 'ArrowRight') {
        changeLightboxPhoto(1);
      } else if (evt.key === 'ArrowLeft') {
        changeLightboxPhoto(-1);
      }
      return;
    }

    if (evt.key === 'ArrowRight') {
      handlePageDelta(1);
    } else if (evt.key === 'ArrowLeft') {
      handlePageDelta(-1);
    }
  });

  lightboxBackdrop.addEventListener('click', closeLightbox);
  lightboxClose.addEventListener('click', closeLightbox);
  lightboxPrev.addEventListener('click', () => changeLightboxPhoto(-1));
  lightboxNext.addEventListener('click', () => changeLightboxPhoto(1));
}

function initPages() {
  pages = months.map((_, monthIndex) => ({
    monthIndex,
    pageNumber: 0,
    totalPages: 1,
    photos: [],
    total: 0
  }));
  currentPageIndex = 0;
  renderPage();
}

function init() {
  reportMissingConfigScript();

  if (!isConfigReady(window.firebaseConfig)) {
    monthLabel.textContent = 'Add firebase-config.js to see your book';
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    return;
  }

  app = initializeApp(window.firebaseConfig);
  db = getFirestore(app);

  bindEvents();
  initPages();
  subscribeToPhotos();
}

init();
