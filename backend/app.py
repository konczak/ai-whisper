from flask import Flask, abort, request
from flask_cors import CORS
from tempfile import NamedTemporaryFile
import whisper
import torch
import os

# Check if NVIDIA GPU is available
torch.cuda.is_available()
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"DEVICE {DEVICE}")

MODEL_TO_USE = os.getenv('MODEL_TO_USE', 'base')
print(f"MODEL_TO_USE {MODEL_TO_USE}")

# Load the Whisper model:
model = whisper.load_model(MODEL_TO_USE, device=DEVICE)

app = Flask(__name__)
CORS(app)

@app.route("/")
def hello():
    return "Whisper Hello World!"


@app.route('/whisper', methods=['POST'])
def handler():
    if not request.files:
        # If the user didn't submit any files, return a 400 (Bad Request) error.
        print('no files')
        abort(400)

    # For each file, let's store the results in a list of dictionaries.
    results = []

    # Loop over every file that the user submitted.
    for filename, handle in request.files.items():
        # Create a temporary file.
        # The location of the temporary file is available in `temp.name`.
        temp = NamedTemporaryFile()
        # Write the user's uploaded file to the temporary file.
        # The file will get deleted when it drops out of scope.
        handle.save(temp)
        # Let's get the transcript of the temporary file.
        # result = model.transcribe(temp.name)

        # load audio and pad/trim it to fit 30 seconds
        audio = whisper.load_audio(temp.name)
        audio = whisper.pad_or_trim(audio)

        mel = whisper.log_mel_spectrogram(audio, n_mels=128).to(model.device)
        #print("mel")
        #print(mel)

        # decode the audio
        options = whisper.DecodingOptions(language='pl',fp16=False)
        print(f"options {options}")
        result = whisper.decode(model, mel, options)

        # Now we can store the result object for this file.
        results.append({
            'filename': filename,
            'language': options.language,
            'transcript': result.text,
        })

    # This will be automatically converted to JSON.
    return {'results': results}
