import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

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
let app;
let db;
let storage;
let isUploading = false;

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

function populateMonths() {
  months.forEach((m, idx) => {
    const option = document.createElement('option');
    option.value = idx.toString();
    option.textContent = m;
    monthSelect.appendChild(option);
  });
}

function setLoading(isLoading, message = '') {
  statusEl.textContent = message;
  if (isLoading) {
    uploadForm.classList.add('loading');
  } else {
    uploadForm.classList.remove('loading');
  }
}

function setControlsDisabled(disabled) {
  uploadForm.querySelectorAll('input, select, textarea, button').forEach((el) => {
    el.disabled = disabled;
    el.setAttribute('aria-disabled', disabled ? 'true' : 'false');
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
  };

  try {
    isUploading = true;
    setControlsDisabled(true);
    setLoading(true, `Uploading ${files.length} photo${files.length > 1 ? 's' : ''}...`);
    const results = await Promise.allSettled(files.map((file, index) => uploadSinglePhoto(file, index)));

    const failed = results
      .map((result, idx) => (result.status === 'rejected' ? files[idx].name : null))
      .filter(Boolean);

    if (failed.length === 0) {
      uploadForm.reset();
      monthSelect.value = month;
      setLoading(false, 'Upload complete! Your photos will appear in the book shortly.');
      setTimeout(() => setLoading(false, ''), 2000);
    } else {
      const successCount = files.length - failed.length;
      setLoading(
        false,
        `Uploaded ${successCount} of ${files.length}. Retry failed files: ${failed.join(', ')}`
      );
      console.error('Some uploads failed', { failed });
    }
  } catch (error) {
    console.error(error);
    setLoading(false, 'Upload failed. Please try again.');
  } finally {
    isUploading = false;
    setControlsDisabled(false);
  }
}

function init() {
  populateMonths();
  reportMissingConfigScript();

  if (!isConfigReady(window.firebaseConfig)) {
    setLoading(false, 'Add your Firebase config in firebase-config.js to enable uploads.');
    setControlsDisabled(true);
    return;
  }

  app = initializeApp(window.firebaseConfig);
  db = getFirestore(app);
  storage = getStorage(app);

  uploadForm.addEventListener('submit', handleUpload);
}

init();
