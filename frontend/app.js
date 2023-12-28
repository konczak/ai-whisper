document.addEventListener('DOMContentLoaded', () => {
    const startRecordingBtn = document.getElementById('startRecording');
    const audioContainer = document.getElementById('audioContainer');
    const transcribeResultContainer = document.getElementById('transcribeResultContainer');

    let recordedChunks = [];

    // Check if the browser supports the necessary APIs
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        startRecordingBtn.addEventListener('click', startRecording);
    } else {
        console.error('getUserMedia is not supported on your browser');
    }

    // Function to start recording
    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                try {
                    const recordedBlob = new Blob(recordedChunks, { type: 'audio/mp3' });
                    console.log('recordedBlob', recordedBlob);

                    const audioUrl = URL.createObjectURL(recordedBlob);
                    const audio = new Audio(audioUrl);
                    audio.controls = true;
                    audioContainer.innerHTML = '';
                    audioContainer.appendChild(audio);

                    // Create a FormData object to send the blob as multipart/form-data
                    const formData = new FormData();
                    formData.append('my-recording-on-fly.mp3', recordedBlob, 'recording.mp3');

                    // Make a POST request using the fetch API
                    const response = await fetch('http://localhost:5000/whisper', {
                        method: 'POST',
                        body: formData
                    });

                    if (response.ok) {
                        console.log('Audio sent successfully');
                        const json = await response.json();
                        transcribeResultContainer.value = json.results[0].transcript;
                    } else {
                        console.error('Failed to send audio:', response.statusText);
                    }
                } catch (error) {
                    console.error('Error sending audio:', error);
                }
            };

            console.log('recordedChunks', recordedChunks);
            recordedChunks = []; // Clear previous recorded chunks
            mediaRecorder.start();
            startRecordingBtn.disabled = true;

            // Stop recording after 10 seconds (adjust as needed)
            setTimeout(() => {
                mediaRecorder.stop();
                startRecordingBtn.disabled = false;
            }, 10000);
        } catch (error) {
            console.error('Error accessing microphone:', error);
        }
    }
});
