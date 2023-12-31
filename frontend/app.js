let elements = null;
let mediaRecorder = null;
let recordingTimeoutId = null;
let timerIntervalId = null;
let chunksEnforcingIntervalId = null;

function init() {
    elements = Object.freeze({
        startRecordingBtn: document.getElementById('startRecording'),
        stopRecordingBtn: document.getElementById('stopRecording'),
        audioContainer: document.getElementById('audioContainer'),
        spinner: document.getElementById('spinner'),
        transcribeResult: document.getElementById('transcribeResult'),
        timer: document.getElementById('timer'),
        copiedElement: document.getElementById('copied'),
    });

    // Check if the browser supports the necessary APIs
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        notifyAboutError('Przepraszamy - wygląda że Twoja przeglądarka nie wspiera nagrywania audio 😥');
    }
}

async function recordingAndProcessing() {
    let recordedChunks = [];

    try {
        const stream = await navigator.mediaDevices.getUserMedia({audio: true});
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            console.log('hello from onstop')
            try {
                const recordedBlob = new Blob(recordedChunks, {type: 'audio/mp3'});
                updateAudioControl(recordedBlob);

                startTimer();

                const json = await sendAudioToTranscribe(recordedBlob);

                elements.transcribeResult.value = json.results[0].transcript;
            } catch (error) {
                notifyAboutError('Błąd wysyłania ścieżki audio do transkrypcji', error);
            }

            finishProcessing();
        };

        recordedChunks = []; // Clear previous recorded chunks
        mediaRecorder.start();

        // Stop recording automatically to prevent long audio
        recordingTimeoutId = setTimeout(stopRecording, 15_000);
    } catch (error) {
        notifyAboutError('Błąd dostępu do mikrofonu', error);
    }

    chunksEnforcingIntervalId = setInterval(function() {
        mediaRecorder.requestData();
    }, 2_000);
}

function startTimer() {
    timerIntervalId = setInterval(updateTimer, 1000);
    elements.timer.dataset.time = 0;
}

function updateTimer() {
    elements.timer.dataset.time++;
    elements.timer.textContent = `Czas oczekiwania na wynik ${elements.timer.dataset.time}s`;
}

function toggleBtn(btn) {
    if (btn.disabled) {
        btn.disabled = false;
    } else {
        btn.disabled = true;
    }
}

function toggleSpinner() {
    if (elements.spinner.dataset.state === 'hidden') {
        elements.spinner.style.display = 'block';
        elements.spinner.dataset.state = 'visible';
    } else {
        elements.spinner.style.display = 'none';
        elements.spinner.dataset.state = 'hidden';
    }
}

async function startRecording() {
    toggleSpinner();
    toggleBtn(elements.startRecordingBtn);
    toggleBtn(elements.stopRecordingBtn);
    await recordingAndProcessing();
}

async function stopRecording() {
    mediaRecorder.stop();
    toggleBtn(elements.stopRecordingBtn);
    if (recordingTimeoutId) {
        clearTimeout(recordingTimeoutId);
    }
}

function finishProcessing() {
    toggleSpinner();
    toggleBtn(elements.startRecordingBtn);
    if (timerIntervalId) {
        clearInterval(timerIntervalId);
    }
    if (chunksEnforcingIntervalId) {
        clearInterval(chunksEnforcingIntervalId);
    }

}

function notifyAboutError(message, error) {
    console.error(message, error);
    elements.transcribeResult.value = message;
    elements.transcribeResult.style.backgroundColor = 'red';
}

async function sendAudioToTranscribe(recordedBlob) {
    const formData = new FormData();
    formData.append('my-recording-on-fly.mp3', recordedBlob, 'recording.mp3');

    const response = await fetch('http://localhost:5000/whisper', {
        method: 'POST',
        body: formData
    });

    if (response.ok) {
        return await response.json();
    } else {
        notifyAboutError('Błąd wysyłania audio do transkrypcji', response.statusText);
    }
}

function updateAudioControl(recordedBlob) {
    const audioUrl = URL.createObjectURL(recordedBlob);

    const audio = new Audio(audioUrl);
    audio.controls = true;
    elements.audioContainer.innerHTML = '';
    elements.audioContainer.appendChild(audio);
}

function textareaCopyToClipboard(event) {
    copyToClipboard(event.value);
}
function copyToClipboard(value) {
    const textarea = document.createElement('textarea');
    textarea.value = value;

    // Make the textarea invisible
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';

    document.body.appendChild(textarea);

    // Select the text in the textarea
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    // Execute the copy command
    document.execCommand('copy');

    // Remove the textarea from the DOM
    document.body.removeChild(textarea);

    elements.copiedElement.style.display = 'block';
    setTimeout(() => elements.copiedElement.style.display = 'none', 10_000)
}

document.addEventListener('DOMContentLoaded', init);
