const referenceFormElement = document.querySelector('#reference-form');
const referenceListElement = document.querySelector('#reference-list');
const referenceCardTemplateElement = document.querySelector('#reference-card-template');
const browserStartButtonElement = document.querySelector('#browser-start-btn');
const browserStopButtonElement = document.querySelector('#browser-stop-btn');
const browserVideoElement = document.querySelector('#browser-video');
const browserOverlayElement = document.querySelector('#browser-overlay');
const browserStatusElement = document.querySelector('#browser-status');

const state = {
  references: [],
  browser: {
    mediaStream: null,
    isRunning: false,
    requestInFlight: false,
    timerId: null,
    captureCanvas: document.createElement('canvas'),
  },
};

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let detailText = 'Request failed';
    try {
      const responseJson = await response.json();
      detailText = responseJson.detail || JSON.stringify(responseJson);
    } catch {
      detailText = response.statusText;
    }
    throw new Error(detailText);
  }
  const hasBody = response.status !== 204;
  return hasBody ? response.json() : null;
}

function showToast(messageText, isError = false) {
  const toastElement = document.createElement('div');
  toastElement.textContent = messageText;
  toastElement.className = isError ? 'chip err' : 'chip ok';
  referenceListElement.prepend(toastElement);
  window.setTimeout(() => toastElement.remove(), 2200);
}

function getSelectedReferenceIds() {
  const selectedInputs = referenceListElement.querySelectorAll('input[type="checkbox"]:checked');
  return [...selectedInputs].map((inputElement) => inputElement.value);
}

function renderReferenceList() {
  referenceListElement.innerHTML = '';
  if (state.references.length === 0) {
    const emptyElement = document.createElement('p');
    emptyElement.className = 'empty-references';
    emptyElement.textContent = 'No reference faces yet. Upload your first image to begin.';
    referenceListElement.append(emptyElement);
    return;
  }

  state.references.forEach((referenceItem) => {
    const cardFragment = referenceCardTemplateElement.content.cloneNode(true);
    const checkboxElement = cardFragment.querySelector('.reference-select');
    const imageElement = cardFragment.querySelector('.reference-photo');
    const nameElement = cardFragment.querySelector('.reference-name');
    const idElement = cardFragment.querySelector('.reference-id');
    const deleteButtonElement = cardFragment.querySelector('.reference-delete');

    checkboxElement.value = referenceItem.reference_id;
    imageElement.src = `/api/references/${referenceItem.reference_id}/image`;
    imageElement.alt = `Reference: ${referenceItem.label}`;
    nameElement.textContent = referenceItem.label;
    idElement.textContent = `ID: ${referenceItem.reference_id.slice(0, 12)}...`;

    deleteButtonElement.addEventListener('click', async () => {
      try {
        await apiRequest(`/api/references/${referenceItem.reference_id}`, { method: 'DELETE' });
        await refreshReferences();
        showToast('Reference removed');
      } catch (error) {
        showToast(error.message, true);
      }
    });

    referenceListElement.append(cardFragment);
  });
}

async function refreshReferences() {
  state.references = await apiRequest('/api/references');
  renderReferenceList();
}

referenceFormElement.addEventListener('submit', async (event) => {
  event.preventDefault();

  const labelValue = document.querySelector('#reference-label').value;
  const imageInputElement = document.querySelector('#reference-image');

  if (!imageInputElement.files || imageInputElement.files.length === 0) {
    showToast('Please choose a face image', true);
    return;
  }

  const formData = new FormData();
  formData.append('label', labelValue);
  formData.append('image', imageInputElement.files[0]);

  try {
    await apiRequest('/api/references', { method: 'POST', body: formData });
    referenceFormElement.reset();
    await refreshReferences();
    showToast('Reference uploaded successfully');
  } catch (error) {
    showToast(error.message, true);
  }
});

refreshReferences().catch((error) => showToast(error.message, true));

function setBrowserStatus(statusText, isError = false) {
  browserStatusElement.textContent = `Status: ${statusText}`;
  browserStatusElement.className = isError ? 'stream-stats err' : 'stream-stats';
}

function syncBrowserCanvasSize() {
  const videoWidth = browserVideoElement.videoWidth;
  const videoHeight = browserVideoElement.videoHeight;
  if (videoWidth <= 0 || videoHeight <= 0) {
    return;
  }

  browserOverlayElement.width = videoWidth;
  browserOverlayElement.height = videoHeight;
  state.browser.captureCanvas.width = videoWidth;
  state.browser.captureCanvas.height = videoHeight;
}

function drawBrowserDetections(detections) {
  const context2D = browserOverlayElement.getContext('2d');
  if (!context2D) {
    return;
  }

  context2D.clearRect(0, 0, browserOverlayElement.width, browserOverlayElement.height);
  detections.forEach((detectionItem) => {
    const strokeColor = detectionItem.is_match ? '#00d264' : '#e23d3d';
    const labelText = `${detectionItem.label} (${detectionItem.distance.toFixed(2)})`;

    context2D.strokeStyle = strokeColor;
    context2D.lineWidth = 2;
    context2D.strokeRect(
      detectionItem.left,
      detectionItem.top,
      detectionItem.right - detectionItem.left,
      detectionItem.bottom - detectionItem.top,
    );

    context2D.fillStyle = strokeColor;
    context2D.fillRect(
      detectionItem.left,
      Math.max(0, detectionItem.top - 22),
      Math.max(140, labelText.length * 7),
      22,
    );

    context2D.fillStyle = '#ffffff';
    context2D.font = '13px Barlow';
    context2D.fillText(labelText, detectionItem.left + 6, Math.max(14, detectionItem.top - 7));
  });
}

async function processBrowserFrame() {
  if (!state.browser.isRunning) {
    return;
  }
  if (state.browser.requestInFlight) {
    state.browser.timerId = window.setTimeout(processBrowserFrame, 220);
    return;
  }

  const captureContext2D = state.browser.captureCanvas.getContext('2d');
  if (!captureContext2D) {
    setBrowserStatus('cannot capture webcam frame context', true);
    return;
  }

  captureContext2D.drawImage(
    browserVideoElement,
    0,
    0,
    state.browser.captureCanvas.width,
    state.browser.captureCanvas.height,
  );
  const imageBase64 = state.browser.captureCanvas.toDataURL('image/jpeg', 0.72);
  const selectedReferenceIds = getSelectedReferenceIds();

  state.browser.requestInFlight = true;
  try {
    const responseJson = await apiRequest('/api/browser-recognition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: imageBase64,
        reference_ids: selectedReferenceIds,
      }),
    });

    drawBrowserDetections(responseJson.detections || []);
    setBrowserStatus(`running (${(responseJson.detections || []).length} face(s) detected)`);
  } catch (error) {
    setBrowserStatus(error.message, true);
  } finally {
    state.browser.requestInFlight = false;
    if (state.browser.isRunning) {
      state.browser.timerId = window.setTimeout(processBrowserFrame, 220);
    }
  }
}

async function startBrowserWebcam() {
  if (state.browser.isRunning) {
    return;
  }

  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!window.isSecureContext && !isLocalhost) {
    showToast('Warning: browser may block webcam access over HTTP on non-localhost hosts', true);
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setBrowserStatus('this browser does not support getUserMedia', true);
    showToast('This browser does not support webcam API', true);
    return;
  }

  try {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: false,
    });

    state.browser.mediaStream = mediaStream;
    browserVideoElement.srcObject = mediaStream;
    await browserVideoElement.play();
    syncBrowserCanvasSize();

    state.browser.isRunning = true;
    setBrowserStatus('starting webcam...');
    state.browser.timerId = window.setTimeout(processBrowserFrame, 250);
  } catch (error) {
    setBrowserStatus('unable to access webcam, please allow camera permission', true);
    showToast(error.message || 'Webcam access error', true);
  }
}

function stopBrowserWebcam() {
  state.browser.isRunning = false;

  if (state.browser.timerId !== null) {
    window.clearTimeout(state.browser.timerId);
    state.browser.timerId = null;
  }

  if (state.browser.mediaStream) {
    state.browser.mediaStream.getTracks().forEach((trackItem) => trackItem.stop());
    state.browser.mediaStream = null;
  }

  browserVideoElement.srcObject = null;
  drawBrowserDetections([]);
  setBrowserStatus('stopped');
}

browserVideoElement.addEventListener('loadedmetadata', () => {
  syncBrowserCanvasSize();
});

window.addEventListener('resize', () => {
  syncBrowserCanvasSize();
});

browserStartButtonElement.addEventListener('click', () => {
  startBrowserWebcam().catch((error) => showToast(error.message, true));
});

browserStopButtonElement.addEventListener('click', () => {
  stopBrowserWebcam();
});

window.addEventListener('beforeunload', () => {
  stopBrowserWebcam();
});
