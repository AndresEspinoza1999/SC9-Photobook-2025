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

const monthSelect = document.getElementById('month');
const uploadForm = document.getElementById('upload-form');
const statusEl = document.getElementById('status');
const spinner = document.getElementById('upload-spinner');
const gallery = document.getElementById('gallery');
const monthTemplate = document.getElementById('month-template');
const photoTemplate = document.getElementById('photo-template');

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
  months.forEach((monthName) => {
    const monthNode = monthTemplate.content.cloneNode(true);
    monthNode.querySelector('.month__title').textContent = monthName;
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
  const monthSection = gallery.children[monthIndex];
  if (!monthSection) return null;
  return {
    grid: monthSection.querySelector('.month__grid'),
    countBadge: monthSection.querySelector('.month__count')
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

function renderPhoto(doc) {
  const data = doc.data();
  const monthIndex = data.month ?? 0;
  const target = findMonthGrid(monthIndex);
  if (!target) return;

  clearEmptyState(target.grid);

  const photoNode = photoTemplate.content.cloneNode(true);
  const img = photoNode.querySelector('img');
  img.src = data.downloadURL;
  img.alt = data.notes ? data.notes : `Photo uploaded to ${months[monthIndex]}`;

  const timestampEl = photoNode.querySelector('.photo__timestamp');
  timestampEl.textContent = formatDate(data.createdAt);

  const infoEl = photoNode.querySelector('.photo__info');
  const hasPhotographer = data.photographer && data.photographer.trim().length > 0;
  infoEl.textContent = hasPhotographer
    ? `${months[monthIndex]} — ${data.photographer}`
    : months[monthIndex];

  const notesEl = photoNode.querySelector('.photo__notes');
  if (data.notes) {
    notesEl.textContent = data.notes;
  } else {
    notesEl.remove();
  }

  target.grid.prepend(photoNode);
  target.countBadge.textContent = target.grid.querySelectorAll('.photo').length;
}

function hydrateExisting() {
  months.forEach((_, idx) => {
    const { grid } = findMonthGrid(idx);
    renderEmptyState(grid);
  });
}

async function handleUpload(event) {
  event.preventDefault();

  const month = monthSelect.value;
  const photographer = document.getElementById('photographer').value.trim();
  const notes = document.getElementById('notes').value.trim();
  const file = document.getElementById('photo').files[0];

  if (!month) {
    setLoading(false, 'Pick a month.');
    return;
  }

  if (!file) {
    setLoading(false, 'Please choose a photo.');
    return;
  }

  if (notes.length > 500) {
    setLoading(false, 'Notes must be 500 characters or fewer.');
    return;
  }

  const monthIndex = parseInt(month, 10);
  const safeName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
  const storageRef = ref(storage, `photos/${monthIndex}/${safeName}`);

  try {
    setLoading(true, 'Uploading photo...');
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

    uploadForm.reset();
    monthSelect.value = month;
    setLoading(false, 'Upload complete!');
    setTimeout(() => setLoading(false, ''), 1800);
  } catch (error) {
    console.error(error);
    setLoading(false, 'Upload failed. Please try again.');
  }
}

function subscribeToGallery() {
  months.forEach((_, idx) => {
    const { grid } = findMonthGrid(idx);
    renderEmptyState(grid);
  });

  const photosRef = collection(db, 'photos');
  const q = query(photosRef, orderBy('createdAt', 'desc'));

  onSnapshot(q, (snapshot) => {
    // Clear all grids before re-rendering
    months.forEach((_, idx) => {
      const { grid } = findMonthGrid(idx);
      grid.innerHTML = '';
    });

    snapshot.docs.forEach(renderPhoto);

    months.forEach((_, idx) => {
      const { grid } = findMonthGrid(idx);
      if (!grid.querySelector('.photo')) {
        renderEmptyState(grid);
      }
    });
  });
}

function init() {
  populateMonths();
  renderMonthContainers();
  hydrateExisting();

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
