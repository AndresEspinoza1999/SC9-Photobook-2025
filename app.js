import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

const firebaseConfig =
  window.firebaseConfig || {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_AUTH_DOMAIN',
    databaseURL: 'YOUR_DATABASE_URL',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_STORAGE_BUCKET',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    appId: 'YOUR_APP_ID',
    measurementId: 'YOUR_MEASUREMENT_ID'
  };

let app;
let db;
let storage;
let isUploading = false;
const PHOTOS_PER_PAGE = 4;
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

const monthState = months.map(() => ({
  photos: [],
  page: 0
}));

const monthSelect = document.getElementById('month');
const uploadForm = document.getElementById('upload-form');
const statusEl = document.getElementById('status');
const spinner = document.getElementById('upload-spinner');
const gallery = document.getElementById('gallery');
const monthTemplate = document.getElementById('month-template');
const photoTemplate = document.getElementById('photo-template');
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightbox-image');
const lightboxCaption = document.getElementById('lightbox-caption');
const lightboxBackdrop = document.getElementById('lightbox-backdrop');
const lightboxPrev = document.getElementById('lightbox-prev');
const lightboxNext = document.getElementById('lightbox-next');
const lightboxClose = document.getElementById('lightbox-close');

let activeLightbox = null;

function isConfigReady(config) {
  if (!config) return false;
  return Object.values(config).every(
    (value) => typeof value === 'string' && value.trim().length > 0 && !value.includes('YOUR_')
  );
}

function disableForm(message) {
  statusEl.textContent = message;
  uploadForm.querySelectorAll('input, select, textarea, button').forEach((el) => {
    el.disabled = true;
    el.setAttribute('aria-disabled', 'true');
  });
}

function populateMonths() {
  months.forEach((m, idx) => {
    const option = document.createElement('option');
    option.value = idx.toString();
    option.textContent = m;
    monthSelect.appendChild(option);
  });
}

function setLoading(isLoading, message = '') {
  if (isLoading) {
    spinner.parentElement.classList.add('loading');
    statusEl.textContent = message || 'Uploading...';
  } else {
    spinner.parentElement.classList.remove('loading');
    statusEl.textContent = message;
  }
}

function setUploadControlsDisabled(isDisabled) {
  uploadForm.querySelectorAll('input, select, textarea, button').forEach((el) => {
    el.disabled = isDisabled;
    el.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');
  });
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(timestamp.toDate ? timestamp.toDate() : timestamp);
}

function renderMonthContainers() {
  months.forEach((monthName, idx) => {
    const monthNode = monthTemplate.content.cloneNode(true);
    const monthEl = monthNode.querySelector('.month');
    monthEl.dataset.monthIndex = idx.toString();
    monthNode.querySelector('.month__title').textContent = monthName;

    const prevBtn = monthNode.querySelector('.pager--prev');
    const nextBtn = monthNode.querySelector('.pager--next');

    prevBtn.addEventListener('click', () => changePage(idx, -1));
    nextBtn.addEventListener('click', () => changePage(idx, 1));

    gallery.appendChild(monthNode);
  });
}

function reportMissingConfigScript() {
  if (window.firebaseConfig) return;

  console.error(
    'firebase-config.js was not loaded. Check that the script path is correct (e.g. /SC9-Photobook-2025/firebase-config.js on GitHub Pages).'
  );
}

function findMonthGrid(monthIndex) {
  const monthSection = gallery.querySelector(`[data-month-index="${monthIndex}"]`);
  if (!monthSection) return null;
  return {
    grid: monthSection.querySelector('.month__grid'),
    countBadge: monthSection.querySelector('.month__count'),
    pageLabel: monthSection.querySelector('.month__page'),
    prevBtn: monthSection.querySelector('.pager--prev'),
    nextBtn: monthSection.querySelector('.pager--next'),
    pageWrapper: monthSection.querySelector('.page')
  };
}

function renderEmptyState(grid) {
  if (grid.querySelector('.empty')) return;
  const empty = document.createElement('p');
  empty.textContent = 'No photos yet for this month.';
  empty.className = 'empty';
  grid.appendChild(empty);
}

function clearEmptyState(grid) {
  const empty = grid.querySelector('.empty');
  if (empty) empty.remove();
}

function buildPhotoCard(photo, monthIndex, absoluteIndex) {
  const photoNode = photoTemplate.content.cloneNode(true);
  const img = photoNode.querySelector('img');
  img.src = photo.downloadURL;
  img.alt = photo.notes ? photo.notes : `Photo uploaded to ${months[monthIndex]}`;

  const frame = photoNode.querySelector('.photo__frame');
  frame.setAttribute('role', 'button');
  frame.tabIndex = 0;
  frame.addEventListener('click', () => openLightbox(monthIndex, absoluteIndex));
  frame.addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault();
      openLightbox(monthIndex, absoluteIndex);
    }
  });

  const timestampEl = photoNode.querySelector('.photo__timestamp');
  timestampEl.textContent = formatDate(photo.createdAt);

  const infoEl = photoNode.querySelector('.photo__info');
  const hasPhotographer = photo.photographer && photo.photographer.trim().length > 0;
  infoEl.textContent = hasPhotographer
    ? `${months[monthIndex]} — ${photo.photographer}`
    : months[monthIndex];

  const notesEl = photoNode.querySelector('.photo__notes');
  if (photo.notes) {
    notesEl.textContent = photo.notes;
  } else {
    notesEl.remove();
  }

  return photoNode;
}

function renderMonthPage(monthIndex, direction = 'next') {
  const target = findMonthGrid(monthIndex);
  if (!target) return;

  const state = monthState[monthIndex];
  const total = state.photos.length;
  const totalPages = total ? Math.ceil(total / PHOTOS_PER_PAGE) : 1;
  state.page = Math.min(state.page, totalPages - 1);

  const start = state.page * PHOTOS_PER_PAGE;
  const pagePhotos = state.photos.slice(start, start + PHOTOS_PER_PAGE);

  target.grid.innerHTML = '';

  if (!pagePhotos.length) {
    renderEmptyState(target.grid);
    target.pageLabel.textContent = 'No photos yet';
  } else {
    pagePhotos.forEach((photo, idx) => {
      const card = buildPhotoCard(photo, monthIndex, start + idx);
      target.grid.appendChild(card);
    });
    target.pageLabel.textContent = `Page ${state.page + 1} of ${Math.max(1, totalPages)}`;
  }

  target.countBadge.textContent = total.toString();
  target.prevBtn.disabled = total === 0 || state.page === 0;
  target.nextBtn.disabled = total === 0 || state.page >= totalPages - 1;

  if (target.pageWrapper) {
    target.pageWrapper.dataset.turn = direction;
    target.pageWrapper.classList.remove('page--turning');
    void target.pageWrapper.offsetWidth;
    target.pageWrapper.classList.add('page--turning');
  }
}

function hydrateExisting() {
  months.forEach((_, idx) => {
    renderMonthPage(idx);
  });
}

async function handleUpload(event) {
  event.preventDefault();

  if (isUploading) {
    statusEl.textContent = 'Upload already in progress. Please wait.';
    return;
  }

  const month = monthSelect.value;
  const photographer = document.getElementById('photographer').value.trim();
  const notes = document.getElementById('notes').value.trim();
  const files = Array.from(document.getElementById('photo').files || []);

  if (!month) {
    setLoading(false, 'Pick a month.');
    return;
  }

  if (!files.length) {
    setLoading(false, 'Please choose at least one photo.');
    return;
  }

  if (notes.length > 500) {
    setLoading(false, 'Notes must be 500 characters or fewer.');
    return;
  }

  const monthIndex = parseInt(month, 10);

  const uploadSinglePhoto = async (file, index) => {
    const safeName = `${Date.now()}-${index}-${file.name.replace(/\s+/g, '-')}`;
    const storageRef = ref(storage, `photos/${monthIndex}/${safeName}`);

    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type
    });

    await new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        () => {},
        (error) => reject(error),
        () => resolve()
      );
    });

    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

    await addDoc(collection(db, 'photos'), {
      month: monthIndex,
      photographer: photographer || null,
      notes: notes || null,
      filename: safeName,
      downloadURL,
      createdAt: serverTimestamp()
    });

    return { originalName: file.name, storedName: safeName };
  };

  try {
    isUploading = true;
    setUploadControlsDisabled(true);
    setLoading(true, `Uploading ${files.length} photo${files.length > 1 ? 's' : ''}...`);
    const results = await Promise.allSettled(files.map((file, index) => uploadSinglePhoto(file, index)));

    const failedFiles = results
      .map((result, idx) => (result.status === 'rejected' ? files[idx].name : null))
      .filter(Boolean);

    if (failedFiles.length === 0) {
      uploadForm.reset();
      monthSelect.value = month;
      setLoading(false, 'Upload complete!');
      setTimeout(() => setLoading(false, ''), 1800);
    } else {
      const successCount = files.length - failedFiles.length;
      setLoading(
        false,
        `Uploaded ${successCount} of ${files.length} photos. Retry failed files: ${failedFiles.join(', ')}`
      );
      console.error('Some uploads failed', { failedFiles, results });
    }
  } catch (error) {
    console.error(error);
    setLoading(false, 'Upload failed. Please try again.');
  } finally {
    isUploading = false;
    setUploadControlsDisabled(false);
  }
}

function changePage(monthIndex, delta) {
  const state = monthState[monthIndex];
  if (!state) return;

  const totalPages = Math.max(1, Math.ceil(state.photos.length / PHOTOS_PER_PAGE));
  const nextPage = Math.min(Math.max(state.page + delta, 0), totalPages - 1);

  if (nextPage === state.page) return;

  state.page = nextPage;
  renderMonthPage(monthIndex, delta > 0 ? 'next' : 'prev');
}

function updateLightbox() {
  if (!activeLightbox) return;
  const { monthIndex, photoIndex } = activeLightbox;
  const state = monthState[monthIndex];
  const photo = state?.photos?.[photoIndex];
  if (!photo) {
    closeLightbox();
    return;
  }

  lightboxImage.src = photo.downloadURL;
  lightboxImage.alt = photo.notes || `Photo from ${months[monthIndex]}`;

  const who = photo.photographer ? ` · ${photo.photographer}` : '';
  const when = photo.createdAt ? ` — ${formatDate(photo.createdAt)}` : '';
  lightboxCaption.textContent = `${months[monthIndex]}${who}${when}`;

  const total = state.photos.length;
  lightboxPrev.disabled = photoIndex === 0;
  lightboxNext.disabled = photoIndex >= total - 1;
}

function openLightbox(monthIndex, photoIndex) {
  activeLightbox = { monthIndex, photoIndex };
  updateLightbox();
  lightbox.classList.add('open');
  lightboxBackdrop.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
  lightboxClose.focus();
}

function closeLightbox() {
  activeLightbox = null;
  lightbox.classList.remove('open');
  lightboxBackdrop.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
}

function changeLightboxPhoto(delta) {
  if (!activeLightbox) return;
  const state = monthState[activeLightbox.monthIndex];
  const total = state?.photos?.length ?? 0;
  if (total === 0) return;

  const nextIndex = Math.min(Math.max(activeLightbox.photoIndex + delta, 0), total - 1);
  activeLightbox.photoIndex = nextIndex;
  updateLightbox();
}

function subscribeToGallery() {
  const photosRef = collection(db, 'photos');
  const q = query(photosRef, orderBy('createdAt', 'desc'));

  onSnapshot(q, (snapshot) => {
    monthState.forEach((state) => {
      state.photos = [];
    });

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const monthIndex = data.month ?? 0;
      const targetState = monthState[monthIndex];
      if (!targetState) return;

      targetState.photos.push({
        id: doc.id,
        ...data
      });
    });

    months.forEach((_, idx) => {
      renderMonthPage(idx);
    });

    if (activeLightbox) {
      updateLightbox();
    }
  });
}

function bindLightboxEvents() {
  lightboxBackdrop?.addEventListener('click', closeLightbox);
  lightboxClose?.addEventListener('click', closeLightbox);
  lightboxPrev?.addEventListener('click', () => changeLightboxPhoto(-1));
  lightboxNext?.addEventListener('click', () => changeLightboxPhoto(1));

  document.addEventListener('keydown', (evt) => {
    if (!lightbox.classList.contains('open')) return;

    if (evt.key === 'Escape') {
      closeLightbox();
    } else if (evt.key === 'ArrowRight') {
      changeLightboxPhoto(1);
    } else if (evt.key === 'ArrowLeft') {
      changeLightboxPhoto(-1);
    }
  });
}

function init() {
  populateMonths();
  renderMonthContainers();
  hydrateExisting();
  bindLightboxEvents();

  reportMissingConfigScript();

  if (!isConfigReady(firebaseConfig)) {
    disableForm('Add your Firebase config in firebase-config.js to enable uploads and the live gallery.');
    return;
  }

  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  storage = getStorage(app);

  uploadForm.addEventListener('submit', handleUpload);
  subscribeToGallery();
}

init();
