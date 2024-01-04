# AI whisper frontend

Just simple page which allows you to start recording process, stop it and will display transcribed text.

## Idea of partial processing 

Instead of sending whole audio at once would like to send partials.

Thanks to `mediaRecorder.requestData()` it is possible to achieve.

Definitely need to avoid situation
when multiple audio streams are send to transcribe in parallel as it can easily lead to dummy results.

It will be useful to send to backend already transcribed text to ensure it will generate continuation. 

```mermaid
sequenceDiagram
participant User
participant Browser
participant Backend

User->>Browser: Clicks "Start Recording"
activate Browser

    loop every 5 seconds
        alt No other send to backend in progress
            Browser->>Backend: Sends partial audio + already transcribed data for processing
            activate Backend
            note right of Backend: WARN it can take more than 5 seconds of loop
            Backend-->>Browser: Returns JSON with transcribed text
            deactivate Backend
            Browser-->>User: Display partially transcribed text
        end
    end

User->>Browser: Clicks "Stop Recording"

Browser->>Backend: Sends rest of audio data for processing
activate Backend
Backend-->>Browser: Returns JSON with transcribed text
deactivate Backend
Browser-->>User: Display transcribed text
deactivate Browser

```
