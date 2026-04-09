const referenceFormElement = document.querySelector('#reference-form');
const referenceListElement = document.querySelector('#reference-list');
const referenceCardTemplateElement = document.querySelector('#reference-card-template');
const browserStartButtonElement = document.querySelector('#browser-start-btn');
const browserStopButtonElement = document.querySelector('#browser-stop-btn');
const browserSendButtonElement = document.querySelector('#browser-send-btn');
const browserVideoElement = document.querySelector('#browser-video');
const browserOverlayElement = document.querySelector('#browser-overlay');
const browserStatusElement = document.querySelector('#browser-status');
const resultsListElement = document.querySelector('#results-list');
const resultItemTemplateElement = document.querySelector('#result-item-template');

const state = {
  references: [],
  browser: {
    mediaStream: null,
    isRunning: false,
    timerId: null,
    detectedFaces: [],
    lastFrameCanvas: document.createElement('canvas'),
    faceDetector: null,
    detectionMode: 'native',
  },
  results: [],
};

function validateRequiredElements() {
  const requiredElements = {
    referenceForm: referenceFormElement,
    referenceList: referenceListElement,
    referenceCardTemplate: referenceCardTemplateElement,
    browserStartBtn: browserStartButtonElement,
    browserStopBtn: browserStopButtonElement,
    browserSendBtn: browserSendButtonElement,
    browserVideo: browserVideoElement,
    browserOverlay: browserOverlayElement,
    browserStatus: browserStatusElement,
    resultsList: resultsListElement,
    resultItemTemplate: resultItemTemplateElement,
  };

  const missingElements = Object.entries(requiredElements)
    .filter(([, element]) => !element)
    .map(([name]) => name);

  if (missingElements.length > 0) {
    throw new Error(`Missing required DOM elements: ${missingElements.join(', ')}`);
  }
}

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

function setBrowserStatus(statusText, isError = false) {
  browserStatusElement.textContent = `Status: ${statusText}`;
  browserStatusElement.className = isError ? 'stream-stats err' : 'stream-stats';
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

function syncBrowserCanvasSize() {
  const videoWidth = browserVideoElement.videoWidth;
  const videoHeight = browserVideoElement.videoHeight;
  if (videoWidth <= 0 || videoHeight <= 0) {
    return;
  }

  browserOverlayElement.width = videoWidth;
  browserOverlayElement.height = videoHeight;
  state.browser.lastFrameCanvas.width = videoWidth;
  state.browser.lastFrameCanvas.height = videoHeight;
}

function drawDetectedFaces(faces) {
  const context2D = browserOverlayElement.getContext('2d');
  if (!context2D) {
    return;
  }

  context2D.clearRect(0, 0, browserOverlayElement.width, browserOverlayElement.height);

  faces.forEach((face, index) => {
    const width = face.right - face.left;
    const height = face.bottom - face.top;
    context2D.strokeStyle = '#4a9eff';
    context2D.lineWidth = 2;
    context2D.strokeRect(face.left, face.top, width, height);

    context2D.fillStyle = '#4a9eff';
    context2D.fillRect(face.left, Math.max(0, face.top - 24), 30, 22);
    context2D.fillStyle = '#ffffff';
    context2D.font = '12px Barlow';
    context2D.fillText(`#${index + 1}`, face.left + 7, Math.max(14, face.top - 8));
  });
}

async function initFaceDetector() {
  // Uu tien FaceDetector native neu trinh duyet ho tro.
  if ('FaceDetector' in window) {
    try {
      state.browser.faceDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 10 });
      state.browser.detectionMode = 'native';
      return;
    } catch {
      state.browser.faceDetector = null;
    }
  }

  state.browser.detectionMode = 'server';
}

async function detectFacesViaServer(canvasElement) {
  const frameBase64 = canvasElement.toDataURL('image/jpeg', 0.65);
  const response = await apiRequest('/api/browser-recognition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: frameBase64, reference_ids: [] }),
  });

  return response.detections.map((detectionItem) => ({
    top: detectionItem.top,
    right: detectionItem.right,
    bottom: detectionItem.bottom,
    left: detectionItem.left,
  }));
}

async function detectFacesOnCanvas(canvasElement) {
  if (state.browser.faceDetector) {
    const faces = await state.browser.faceDetector.detect(canvasElement);
    return faces.map((face) => {
      const x = Math.max(0, Math.floor(face.boundingBox.x));
      const y = Math.max(0, Math.floor(face.boundingBox.y));
      const width = Math.max(1, Math.floor(face.boundingBox.width));
      const height = Math.max(1, Math.floor(face.boundingBox.height));
      return {
        top: y,
        left: x,
        bottom: y + height,
        right: x + width,
      };
    });
  }

  // Fallback: detect vi tri mat bang server de luon hoat dong tren moi browser.
  return detectFacesViaServer(canvasElement);
}

async function detectFrameFaces() {
  if (!state.browser.isRunning) {
    return;
  }

  const captureContext = state.browser.lastFrameCanvas.getContext('2d');
  if (!captureContext) {
    setBrowserStatus('cannot capture frame context', true);
    return;
  }

  captureContext.drawImage(
    browserVideoElement,
    0,
    0,
    state.browser.lastFrameCanvas.width,
    state.browser.lastFrameCanvas.height,
  );

  try {
    const faces = await detectFacesOnCanvas(state.browser.lastFrameCanvas);
    state.browser.detectedFaces = faces;
    drawDetectedFaces(faces);

    if (faces.length > 0) {
      browserSendButtonElement.disabled = false;
      setBrowserStatus(`detected ${faces.length} face(s) via ${state.browser.detectionMode} detector - click Send Detected Faces`);
    } else {
      browserSendButtonElement.disabled = true;
      setBrowserStatus(`webcam running (${state.browser.detectionMode}) - no faces detected`);
    }
  } catch (error) {
    setBrowserStatus(`detection error: ${error.message}`, true);
  }

  if (state.browser.isRunning) {
    state.browser.timerId = window.setTimeout(detectFrameFaces, 800);
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
    await initFaceDetector();

    state.browser.isRunning = true;
    browserSendButtonElement.disabled = true;
    setBrowserStatus('webcam running - detecting faces...');
    state.browser.timerId = window.setTimeout(detectFrameFaces, 500);
  } catch (error) {
    console.error('Webcam access error:', error);
    setBrowserStatus('unable to access webcam, please allow camera permission', true);
    showToast(error.message || 'Webcam access error', true);
  }
}

function stopBrowserWebcam() {
  state.browser.isRunning = false;
  state.browser.detectedFaces = [];

  if (state.browser.timerId !== null) {
    window.clearTimeout(state.browser.timerId);
    state.browser.timerId = null;
  }

  if (state.browser.mediaStream) {
    state.browser.mediaStream.getTracks().forEach((track) => track.stop());
    state.browser.mediaStream = null;
  }

  browserVideoElement.srcObject = null;
  drawDetectedFaces([]);
  browserSendButtonElement.disabled = true;
  setBrowserStatus('stopped');
}

function addResultsToHistory(matches, faceCrops) {
  matches.forEach((match, index) => {
    const distance = Number(match.distance ?? 1);
    state.results.unshift({
      timestamp: new Date().toLocaleTimeString(),
      identity: match.identity,
      isMatch: Boolean(match.is_match),
      confidenceText: `${Math.max(0, (1 - distance) * 100).toFixed(1)}%`,
      cropBase64: faceCrops[index] ?? '',
    });
  });

  if (state.results.length > 200) {
    state.results = state.results.slice(0, 200);
  }

  renderResultsList();
}

function renderResultsList() {
  resultsListElement.innerHTML = '';

  if (state.results.length === 0) {
    const emptyElement = document.createElement('p');
    emptyElement.className = 'empty-results';
    emptyElement.textContent = 'No detection results yet. Detect and send faces to see results here.';
    resultsListElement.append(emptyElement);
    return;
  }

  state.results.forEach((result) => {
    const itemFragment = resultItemTemplateElement.content.cloneNode(true);
    const nameElement = itemFragment.querySelector('.result-name');
    const timestampElement = itemFragment.querySelector('.result-timestamp');
    const cropElement = itemFragment.querySelector('.result-crop');
    const identityElement = itemFragment.querySelector('.result-identity');
    const confidenceElement = itemFragment.querySelector('.result-confidence');

    nameElement.textContent = result.identity;
    timestampElement.textContent = result.timestamp;
    cropElement.src = result.cropBase64;
    identityElement.textContent = `${result.identity} ${result.isMatch ? '✓' : '(mismatch)'}`;
    confidenceElement.textContent = result.confidenceText;
    resultsListElement.append(itemFragment);
  });
}

async function sendDetectedFacesToServer() {
  if (state.browser.detectedFaces.length === 0) {
    showToast('No detected faces to send', true);
    return;
  }

  const selectedReferenceIds = getSelectedReferenceIds();
  if (selectedReferenceIds.length === 0) {
    showToast('Please select at least one reference face to match against', true);
    return;
  }

  setBrowserStatus('sending detected faces to server...');
  browserSendButtonElement.disabled = true;

  try {
    const faceCrops = state.browser.detectedFaces.map((face) => {
      const cropCanvas = document.createElement('canvas');
      const cropContext = cropCanvas.getContext('2d');
      const width = Math.max(1, face.right - face.left);
      const height = Math.max(1, face.bottom - face.top);
      cropCanvas.width = width;
      cropCanvas.height = height;

      cropContext.drawImage(
        browserVideoElement,
        face.left,
        face.top,
        width,
        height,
        0,
        0,
        width,
        height,
      );
      return cropCanvas.toDataURL('image/jpeg', 0.85);
    });

    const payload = {
      face_crops: faceCrops,
      face_locations: state.browser.detectedFaces,
      reference_ids: selectedReferenceIds,
    };

    const response = await apiRequest('/api/browser-detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    addResultsToHistory(response.matches, faceCrops);
    setBrowserStatus(`matched ${response.matches.length} face(s)`);
  } catch (error) {
    setBrowserStatus(`server error: ${error.message}`, true);
    showToast(error.message, true);
  } finally {
    browserSendButtonElement.disabled = state.browser.detectedFaces.length === 0;
  }
}

referenceFormElement.addEventListener('submit', async (event) => {
  event.preventDefault();

  const labelInputElement = document.querySelector('#reference-label');
  const imageInputElement = document.querySelector('#reference-image');

  if (!imageInputElement.files || imageInputElement.files.length === 0) {
    showToast('Please choose a face image', true);
    return;
  }

  const formData = new FormData();
  formData.append('label', labelInputElement.value);
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

browserSendButtonElement.addEventListener('click', () => {
  sendDetectedFacesToServer().catch((error) => showToast(error.message, true));
});

window.addEventListener('beforeunload', () => {
  stopBrowserWebcam();
});

try {
  validateRequiredElements();
  renderResultsList();
  refreshReferences().catch((error) => showToast(error.message, true));
} catch (error) {
  console.error(error.message);
  document.body.innerHTML = `<div style="padding: 2rem; color: red;"><h2>Error: Missing UI elements</h2><p>${error.message}</p></div>`;
}
