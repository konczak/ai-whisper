(function () {
    let audioRecorder = null;
    let whisperApiClient = null;

    class WhisperApiClient {

        constructor() {
            this.inProgress = false;
        }
        isRequestInProgress() {
            return this.inProgress;
        }
        async sendAudioToTranscribe(prompt, recordedBlob) {
            if (this.inProgress) {
                return;
            }
            this.inProgress = true;
            const formData = new FormData();
            formData.append('my-recording-on-fly.mp3', recordedBlob, 'recording.unknown');
            //formData.append('prompt', prompt);

            try {
                const response = await fetch('http://localhost:5000/whisper', {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    return await response.json();
                } else {
                    notifyAboutError('Błąd wysyłania audio do transkrypcji', response.statusText);
                    throw new Error(response.statusText);
                }
            } finally {
                this.inProgress = false;
            }
        }
    }

    class Page {
        static elements;

        static bindElements() {
            Page.elements = Object.freeze({
                startRecordingBtn: document.getElementById('startRecording'),
                stopRecordingBtn: document.getElementById('stopRecording'),
                audioContainer: document.getElementById('audioContainer'),
                spinner: document.getElementById('spinner'),
                transcribeResult: document.getElementById('transcribeResult'),
                timer: document.getElementById('timer'),
                copiedElement: document.getElementById('copied'),
            });

            Page.elements.startRecordingBtn.addEventListener('click', startRecording);
            Page.elements.stopRecordingBtn.addEventListener('click', stopRecording);
            Page.elements.transcribeResult.addEventListener('click', textareaCopyToClipboard);
        }

        static hideSpinner() {
            Page.elements.spinner.style.display = 'none';
            Page.elements.spinner.dataset.state = 'hidden';
        }

        static showSpinner() {
            Page.elements.spinner.style.display = 'block';
            Page.elements.spinner.dataset.state = 'visible';
        }

        static toggleSpinner() {
            if (Page.elements.spinner.dataset.state === 'hidden') {
                Page.showSpinner();
            } else {
                Page.hideSpinner();
            }
        }

        static disableBtn(btn) {
            btn.disabled = true;
        }

        static enableBtn(btn) {
            btn.disabled = false;
        }

        static toggleBtn(btn) {
            btn.disabled ? Page.enableBtn(btn) : Page.disableBtn(btn);
        }

        static updateAudioControl(recordedBlob) {
            const audioUrl = URL.createObjectURL(recordedBlob);

            const audio = new Audio(audioUrl);
            audio.controls = true;
            // Page.elements.audioContainer.innerHTML = '';
            Page.elements.audioContainer.appendChild(audio);
        }

        static updateTimer(seconds) {
            Page.elements.timer.textContent = `Czas oczekiwania na wynik ${seconds}s`;
        }

        static updateTranscribedText(transcribedText) {
            Page.elements.transcribeResult.value = transcribedText;
        }
    }

    class Queue {
        constructor() {
            this.items = [];
            this.securedFirstChunk = null;
            this.accessPromise = Promise.resolve();
        }

        async push(recordedChunks) {
            await this.accessPromise;

            this.accessPromise = new Promise(resolve => {
                if (Array.isArray(recordedChunks)) {
                    this.items.push(...recordedChunks);
                } else {
                    this.items.push(recordedChunks);
                }
                resolve();
            });
        }

        async takeAll() {
            await this.accessPromise;

            const allAvailable = await new Promise(resolve => {
                const spliced = this.items.splice(0, this.items.length);
                if (this.securedFirstChunk) {
                    spliced.unshift(this.securedFirstChunk);
                } {
                    this.securedFirstChunk = spliced[0];
                }

                resolve(spliced);
                // resolve(this.items);
            });

            this.accessPromise = Promise.resolve();

            return allAvailable;
        }
    }

    class Timer {
        constructor() {
            this.seconds = 0;
            this.intervalId = null;
        }

        start() {
            this.intervalId = setInterval(() => {
                this.seconds++;
                Page.updateTimer(this.seconds);
            }, 1000);
        }

        stop() {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    class AudioRecorder {
        constructor() {
            this.recordedChunksQueue = null;
            this.mediaRecorder = null;
            this.recordingTimeoutId = null;
            this.timer = null;
            this.transcribedText = '';
        }

        async handleDataAvailable(event) {
            console.log('data!', event.data.size);
            if (event.data.size > 0) {
                await this.recordedChunksQueue.push(event.data);

                if (!whisperApiClient.isRequestInProgress()) {
                    await this.transcribe();
                }
            }
        }

        async transcribe() {
            while (whisperApiClient.isRequestInProgress()) {
                await sleep(100);
            }
            try {
                const recordedChunks = await this.recordedChunksQueue.takeAll();
                if (recordedChunks.length === 0) {
                    console.log('there are no chunks to transcribe - skip');
                    return;
                }
                console.log('recordedChunks', recordedChunks);
                const recordedBlob = new Blob(recordedChunks, {type: this.mediaRecorder.mimeType});
                Page.updateAudioControl(recordedBlob);

                this.timer = new Timer(Page.elements.timer);
                this.timer.start();

                const json = await whisperApiClient.sendAudioToTranscribe(this.transcribedText, recordedBlob);
                this.transcribedText += json.results[0].transcript;

                Page.updateTranscribedText(this.transcribedText);
            } catch (error) {
                notifyAboutError('Błąd wysyłania ścieżki audio do transkrypcji', error);
            } finally {
                this.timer.stop();
            }
        }

        /*
        forceProducingChunks() {
            this.mediaRecorder.requestData();
        }
         */

        async handleStop() {
            await this.transcribe();

            this.finishProcessing();
        }

        async start() {
            try {
                this.recordedChunksQueue = new Queue();
                const stream = await navigator.mediaDevices.getUserMedia({audio: true});
                this.mediaRecorder = new MediaRecorder(stream);
                this.transcribedText = '';

                this.mediaRecorder.ondataavailable = (event) => this.handleDataAvailable(event);
                this.mediaRecorder.onstop = () => this.handleStop();

                // force split into time frame chunks
                this.mediaRecorder.start(5_000);

                // Stop recording automatically to prevent long audio
                //this.recordingTimeoutId = setTimeout(() => this.stop(), 30_000);
            } catch (error) {
                notifyAboutError('Błąd dostępu do mikrofonu', error);
            }
        }

        stop() {
            if (this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }
            clearTimeout(this.recordingTimeoutId);
        }

        finishProcessing() {
            Page.toggleSpinner();
            Page.toggleBtn(Page.elements.startRecordingBtn);
            this.timer.stop();
        }
    }

    function init() {
        Page.bindElements();
        whisperApiClient = new WhisperApiClient();

        // Check if the browser supports the necessary APIs
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            notifyAboutError('Przepraszamy - wygląda że Twoja przeglądarka nie wspiera nagrywania audio 😥');
        }
    }

    async function startRecording() {
        Page.toggleSpinner();
        Page.toggleBtn(Page.elements.startRecordingBtn);
        Page.toggleBtn(Page.elements.stopRecordingBtn);
        audioRecorder = new AudioRecorder();
        await audioRecorder.start();
    }

    async function stopRecording() {
        await audioRecorder.stop();
        Page.toggleBtn(Page.elements.stopRecordingBtn);
    }

    function notifyAboutError(message, error) {
        console.error(message, error);
        Page.elements.transcribeResult.value = message;
        Page.elements.transcribeResult.style.backgroundColor = 'red';
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function textareaCopyToClipboard(event) {
        copyToClipboard(event.target.value);
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

        Page.elements.copiedElement.style.display = 'block';
        setTimeout(() => Page.elements.copiedElement.style.display = 'none', 10_000)
    }

    document.addEventListener('DOMContentLoaded', init);
})();
