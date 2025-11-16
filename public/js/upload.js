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
const uploadButton = uploadForm.querySelector('button[type="submit"]');
const fileInput = document.getElementById('photo');
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
  uploadForm.classList.toggle('loading', isLoading);
  uploadForm.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  uploadButton.disabled = isLoading;
  uploadButton.setAttribute('aria-disabled', isLoading ? 'true' : 'false');
  fileInput.disabled = isLoading;
  fileInput.setAttribute('aria-disabled', isLoading ? 'true' : 'false');
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

  const uploadSinglePhoto = async (file, index, total) => {
    const safeName = `${Date.now()}-${index}-${file.name.replace(/\s+/g, '-')}`;
    const storageRef = ref(storage, `photos/${monthIndex}/${safeName}`);

    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type
    });

    await new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          setLoading(true, `Uploading ${index + 1}/${total}... ${percent}%`);
        },
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
    setLoading(true, `Preparing to upload ${files.length} photo${files.length > 1 ? 's' : ''}...`);

    const results = await Promise.allSettled(
      files.map((file, index) => uploadSinglePhoto(file, index, files.length))
    );

    const failed = results
      .map((result, idx) => (result.status === 'rejected' ? files[idx].name : null))
      .filter(Boolean);

    if (failed.length === 0) {
      uploadForm.reset();
      monthSelect.value = month;
      setLoading(false, 'Upload complete! Your photos will appear in the book shortly.');
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
    setLoading(false, statusEl.textContent);
  }
}

function init() {
  populateMonths();
  reportMissingConfigScript();

  if (!isConfigReady(window.firebaseConfig)) {
    setLoading(false, 'Add your Firebase config in firebase-config.js to enable uploads.');
    uploadButton.disabled = true;
    uploadButton.setAttribute('aria-disabled', 'true');
    fileInput.disabled = true;
    fileInput.setAttribute('aria-disabled', 'true');
    return;
  }

  app = initializeApp(window.firebaseConfig);
  db = getFirestore(app);
  storage = getStorage(app);

  setLoading(false, 'Ready to upload.');
  uploadForm.addEventListener('submit', handleUpload);
}

init();
