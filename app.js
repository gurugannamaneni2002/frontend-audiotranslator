document.addEventListener('DOMContentLoaded', () => {
    // Firebase configuration
    const firebaseConfig = {
        apiKey: "AIzaSyD4q1fPc21GE2vQA1cv6d7TiONuRcYzDn0",
        authDomain: "chatting-in-realtime.firebaseapp.com",
        databaseURL: "https://chatting-in-realtime-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "chatting-in-realtime",
        storageBucket: "chatting-in-realtime.firebasestorage.app",
        messagingSenderId: "411732598260",
        appId: "1:411732598260:web:f3f2daf1536cd003d8eda1",
        measurementId: "G-F5R7Z7TD6R"
    };

    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();

    // Translation API endpoint
    const TRANSLATION_API = 'https://realtime-translation-app-production.up.railway.app/translate';

    // DOM elements
    const languageSelect = document.getElementById('language');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const roomInput = document.getElementById('roomInput');
    const roomIdDisplay = document.getElementById('roomIdDisplay');
    const connectionStatus = document.getElementById('connectionStatus');
    const receivedMessages = document.getElementById('receivedMessages');
    const muteButton = document.getElementById('muteButton');

    // WebRTC variables
    let roomId = null;
    let signalingRef = null;
    let peerConnection = null;
    let dataChannel = null;
    let isConnected = false;
   
    // Speech recognition variables
    let recognition = null;
    let isRecording = false;
    let isMuted = false;
   
    // User information
    let username = 'User_' + Math.floor(Math.random() * 1000);
    let userColor = getRandomColor();

    // Language mapping for speech recognition
    const speechRecognitionLanguages = {
        'en': 'en-US',
        'es': 'es-ES',
        'fr': 'fr-FR',
        'de': 'de-DE',
        'ja': 'ja-JP',
        'zh-cn': 'zh-CN',
        'hi': 'hi-IN',
        'ru': 'ru-RU',
        'it': 'it-IT',
        'pt': 'pt-BR',
        'nl': 'nl-NL',
        'pl': 'pl-PL',
        'ar': 'ar-SA',
        'ko': 'ko-KR'
    };

    // Initialize with default options and then try to fetch more
    function initializeLanguageOptions() {
        // Set default options
        const defaultLanguages = {
            'en': 'English',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'ja': 'Japanese',
            'zh-cn': 'Chinese (Simplified)',
            'hi': 'Hindi',
            'ru': 'Russian'
        };
       
        // Clear and populate with defaults
        languageSelect.innerHTML = '';
       
        for (const [code, name] of Object.entries(defaultLanguages)) {
            const option = document.createElement('option');
            option.value = code;
            option.textContent = name;
            languageSelect.appendChild(option);
        }
       
        // Set default value
        languageSelect.value = 'en';
       
        // Then try to fetch more languages
        populateLanguageOptions();
    }

    async function textToSpeech(text, language) {
        try {
            const response = await fetch('https://realtime-translation-app-production.up.railway.app/text_to_speech', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    language: language
                })
            });
           
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
           
            // Get the audio blob
            const audioBlob = await response.blob();
           
            // Create an audio element and play it
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
           
            // Return the audio element so we can control it later
            return audio;
        } catch (error) {
            console.error('Text-to-speech error:', error);
            return null;
        }
    }

    async function populateLanguageOptions() {
        console.log("Fetching supported languages...");
        try {
            const response = await fetch('https://realtime-translation-app-production.up.railway.app/supported_languages');
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
           
            const data = await response.json();
            console.log("Received languages data:", data);
            const languages = data.languages;
           
            // Clear existing options
            languageSelect.innerHTML = '';
           
            // Populate language dropdown
            for (const [code, name] of Object.entries(languages)) {
                const option = document.createElement('option');
                option.value = code;
                option.textContent = name;
                languageSelect.appendChild(option);
            }
           
            // Set default value
            languageSelect.value = 'en';
           
            console.log("Language options populated successfully");
        } catch (error) {
            console.error('Error fetching supported languages:', error);
            console.log("Using fallback language options");
            // Fallback is already handled by initializeLanguageOptions
        }
    }

    // Generate random color for user
    function getRandomColor() {
        const colors = [
            '#3498db', '#2ecc71', '#e74c3c', '#f39c12',
            '#9b59b6', '#1abc9c', '#d35400', '#c0392b'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    // Initialize speech recognition
    function initSpeechRecognition() {
        // Check browser support
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.error('Speech recognition not supported in this browser. Try Chrome or Edge.');
            return;
        }
       
        // Create speech recognition instance
        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
       
        // Configure recognition
        recognition.continuous = true;
        recognition.interimResults = true;
       
        // Set language based on the selected language
        const langCode = languageSelect.value;
        recognition.lang = speechRecognitionLanguages[langCode] || 'en-US';
       
        // Event handlers
        recognition.onstart = () => {
            isRecording = true;
            console.log('Listening continuously...');
        };
       
        recognition.onend = () => {
            // If we're still connected and not muted, restart
            if (isConnected && !isMuted) {
                recognition.start();
                console.log("Restarting speech recognition automatically");
            } else {
                isRecording = false;
                console.log('Stopped listening');
            }
        };
       
        recognition.onerror = (event) => {
            console.error('Speech Recognition Error:', event.error);
           
            // If still connected and not muted, try to restart after errors
            if (isConnected && !isMuted) {
                setTimeout(() => {
                    try {
                        recognition.start();
                        console.log("Restarting after error");
                    } catch (e) {
                        console.error("Failed to restart after error:", e);
                    }
                }, 1000);
            }
        };
       
        recognition.onresult = (event) => {
            // Skip processing if muted
            if (isMuted) return;
           
            let finalTranscript = '';
           
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const text = result[0].transcript;
               
                if (result.isFinal) {
                    finalTranscript += text;
                    // Process and send final transcript
                    processSpeechResult(text);
                }
            }
        };
    }

    // Process speech result and send to peer
    async function processSpeechResult(text) {
        if (!text.trim() || isMuted) return;
       
        // Get the current language
        const currentLang = languageSelect.value;
       
        // Send the original text and language to peer
        sendTranscriptToPeer({
            original: text,
            sourceLang: currentLang
        });
    }

    // Translate text using the Python backend
    async function translateText(text, sourceLang, targetLang) {
        try {
            const response = await fetch(TRANSLATION_API, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    source_lang: sourceLang,
                    target_lang: targetLang
                })
            });
           
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
           
            const data = await response.json();
            return data.translated_text;
        } catch (error) {
            console.error('Translation API error:', error);
            throw error;
        }
    }
   
    // WebRTC functions
    function initializeWebRTC() {
        console.log("🔵 Initializing WebRTC...");

        peerConnection = new RTCPeerConnection({
            iceServers: [
    {
      urls: [
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun.l.google.com:19302",
        "stun:stun3.l.google.com:19302",
        "stun:stun4.l.google.com:19302",
        "stun:stun.services.mozilla.com",
        "stun:stun.relay.metered.ca:80",
      ],
    },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "17816c61120a0756deb0121d",
      credential: "rmrPz0In67MBB/qO",
     },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: "17816c61120a0756deb0121d",
      credential: "rmrPz0In67MBB/qO",
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: "17816c61120a0756deb0121d",
      credential: "rmrPz0In67MBB/qO",
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: "17816c61120a0756deb0121d",
      credential: "rmrPz0In67MBB/qO",
    },
  ],
        });

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log("🟢 ICE Candidate Generated");
                signalingRef.child("candidates").push(event.candidate.toJSON());
            }
        };

        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            console.log("Connection state:", peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
                setConnectionStatus('Connected', true);
                isConnected = true;
                muteButton.disabled = false;
               
                // Start speech recognition automatically when connected
                if (!isRecording && !isMuted) {
                    startSpeechRecognition();
                }
            } else if (peerConnection.connectionState === 'disconnected' ||
                       peerConnection.connectionState === 'failed') {
                setConnectionStatus('Disconnected', false);
                isConnected = false;
                muteButton.disabled = true;
               
                // Stop speech recognition if disconnected
                if (isRecording) {
                    stopSpeechRecognition();
                }
            }
        };

        // Handle receiving a data channel
        peerConnection.ondatachannel = (event) => {
            console.log("🔵 Received data channel");
            dataChannel = event.channel;
            setupDataChannel();
        };

        console.log("✅ WebRTC Initialized");
    }

    function setupDataChannel() {
        if (!dataChannel) {
            console.error("❌ DataChannel is not available!");
            return;
        }

        console.log("🟢 Setting up DataChannel...");
       
        dataChannel.onopen = () => {
            console.log("✅ DataChannel Open!");
            setConnectionStatus('Connected', true);
            isConnected = true;
            muteButton.disabled = false;
           
            // Start speech recognition automatically when channel is open
            if (!isRecording && !isMuted) {
                startSpeechRecognition();
            }
        };

        dataChannel.onmessage = (event) => {
            console.log("📩 Message Received");
           
            try {
                const data = JSON.parse(event.data);
               
                // Handle transcript messages
                if (data.type === 'transcript') {
                    displayReceivedTranscript(data);
                }
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };

        dataChannel.onclose = () => {
            console.log("❌ DataChannel Closed!");
            setConnectionStatus('Disconnected', false);
            isConnected = false;
            muteButton.disabled = true;
           
            // Stop speech recognition if channel is closed
            if (isRecording) {
                stopSpeechRecognition();
            }
        };
    }

    function joinOrCreateRoom() {
        const inputRoomId = roomInput.value.trim();
       
        if (inputRoomId) {
            // Try to join existing room
            joinRoom(inputRoomId);
        } else {
            // Create new room
            createRoom();
        }
    }

    function createRoom() {
        roomId = Math.random().toString(36).substring(2, 10); // Generate unique room ID
        signalingRef = db.ref(`webrtc_signaling/${roomId}`);
        roomIdDisplay.innerText = roomId;
        setConnectionStatus('Waiting for peer...', false);

        initializeWebRTC();
       
        // Create DataChannel before the offer
        dataChannel = peerConnection.createDataChannel("transcript");
        setupDataChannel();
        console.log("✅ Data Channel Created");
       
        peerConnection.createOffer().then(offer => {
            return peerConnection.setLocalDescription(offer).then(() => {
                console.log("📡 Offer Created & Set as Local Description");
                return signalingRef.child("offer").set(offer);
            });
        }).then(() => {
            console.log("✅ Offer stored in Firebase, waiting for answer...");

            // Listen for answer
            signalingRef.child("answer").on("value", async (snapshot) => {
                if (snapshot.exists() && !peerConnection.remoteDescription) {
                    console.log("📡 Answer Received");
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(snapshot.val()));
                }
            });

            // Listen for ICE candidates
            signalingRef.child("candidates").on("child_added", async (snapshot) => {
                console.log("📡 ICE Candidate Received");
                if (snapshot.exists() && peerConnection.remoteDescription) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val()));
                }
            });

        }).catch(error => {
            console.error("❌ Error creating offer:", error);
            alert("Error creating room: " + error.message);
        });
    }

    function joinRoom(inputRoomId) {
        roomId = inputRoomId;
        signalingRef = db.ref(`webrtc_signaling/${roomId}`);
        roomIdDisplay.innerText = roomId;
        setConnectionStatus('Connecting...', false);

        initializeWebRTC();

        signalingRef.child("offer").once("value").then(async snapshot => {
            if (snapshot.exists()) {
                console.log("📡 Offer Found in Firebase");

                await peerConnection.setRemoteDescription(new RTCSessionDescription(snapshot.val()));
                console.log("✅ Remote Description Set");

                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                console.log("📡 Answer Created & Set as Local Description");

                await signalingRef.child("answer").set(answer);
                console.log("✅ Answer stored in Firebase");

            } else {
                console.error("❌ No offer found in Firebase for Room ID:", roomId);
                alert("Room not found. Creating a new room with this ID.");
               
                // Create a new room with this ID instead
                signalingRef = db.ref(`webrtc_signaling/${roomId}`);
               
                initializeWebRTC();
               
                // Create DataChannel before the offer
                dataChannel = peerConnection.createDataChannel("transcript");
                setupDataChannel();
               
                peerConnection.createOffer().then(offer => {
                    return peerConnection.setLocalDescription(offer).then(() => {
                        return signalingRef.child("offer").set(offer);
                    });
                }).then(() => {
                    // Listen for answer
                    signalingRef.child("answer").on("value", async (snapshot) => {
                        if (snapshot.exists() && !peerConnection.remoteDescription) {
                            await peerConnection.setRemoteDescription(new RTCSessionDescription(snapshot.val()));
                        }
                    });
                   
                    // Listen for ICE candidates
                    signalingRef.child("candidates").on("child_added", async (snapshot) => {
                        if (snapshot.exists() && peerConnection.remoteDescription) {
                            await peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val()));
                        }
                    });
                });
            }

            // Listen for ICE candidates
            signalingRef.child("candidates").on("child_added", async (snapshot) => {
                console.log("📡 ICE Candidate Received");
                if (snapshot.exists() && peerConnection.remoteDescription) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val()));
                }
            });

        }).catch(error => {
            console.error("❌ Error joining room:", error);
            alert("Error joining room: " + error.message);
        });
    }

    // Send transcript to peer
    function sendTranscriptToPeer(transcriptData) {
        if (dataChannel && dataChannel.readyState === "open") {
            console.log("📤 Sending transcript");
           
            const message = {
                type: 'transcript',
                original: transcriptData.original,
                sourceLang: transcriptData.sourceLang,
                timestamp: new Date().toISOString(),
                username: username,
                userColor: userColor,
                error: transcriptData.error || false
            };
           
            dataChannel.send(JSON.stringify(message));
        } else if (isConnected) {
            console.error("❌ DataChannel is not open but connection is established!");
        }
    }

    // Display received transcript with translation
    async function displayReceivedTranscript(data) {
        // Create message element
        const messageElement = document.createElement('div');
        messageElement.className = 'received-message';
       
        // Create message header with username
        const header = document.createElement('div');
        header.className = 'message-header';
        header.style.color = data.userColor || '#3498db';
        header.textContent = `${data.username || 'Peer'}:`;
        messageElement.appendChild(header);
       
        // Create original text element
        const originalText = document.createElement('div');
        originalText.className = 'original-text';
        originalText.textContent = data.original;
        messageElement.appendChild(originalText);
       
        // Add timestamp
        const timestamp = document.createElement('div');
        timestamp.className = 'timestamp';
        timestamp.textContent = new Date().toLocaleTimeString();
        messageElement.appendChild(timestamp);
       
        // Get target language (your language)
        const targetLang = languageSelect.value;
       
        // Add to DOM immediately to show original text
        receivedMessages.appendChild(messageElement);
        receivedMessages.scrollTop = receivedMessages.scrollHeight;
       
        // Create audio button for playback
        const audioButton = document.createElement('button');
        audioButton.className = 'audio-btn';
        audioButton.innerHTML = '<i class="fas fa-volume-up"></i>';
        audioButton.title = 'Play audio';
       
        // Check if source and target languages are the same
        if (data.sourceLang === targetLang) {
            // Same language - no translation needed, but still add audio playback
            const audioContainer = document.createElement('div');
            audioContainer.className = 'audio-container';
            audioContainer.textContent = 'Play message: ';
            audioContainer.appendChild(audioButton);
            messageElement.appendChild(audioContainer);
           
            // Add click event to play audio of the original text
            audioButton.addEventListener('click', async () => {
                audioButton.disabled = true;
                audioButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
               
                const audio = await textToSpeech(data.original, targetLang);
                if (audio) {
                    audio.play();
                    audio.onended = () => {
                        audioButton.disabled = false;
                        audioButton.innerHTML = '<i class="fas fa-volume-up"></i>';
                    };
                } else {
                    audioButton.disabled = false;
                    audioButton.innerHTML = '<i class="fas fa-volume-up"></i>';
                }
            });
           
            // Auto-play the audio
            setTimeout(() => {
                audioButton.click();
            }, 300);
           
            return;
        }
       
        // Different languages - need translation
        const translationLoading = document.createElement('div');
        translationLoading.className = 'translation-loading';
        translationLoading.textContent = 'Translating...';
        messageElement.appendChild(translationLoading);
       
        // Translate the text at the receiver end
        try {
            const translatedText = await translateText(data.original, data.sourceLang, targetLang);
           
            // Replace loading indicator with translated text
            if (translatedText && translatedText !== data.original) {
                const translatedElement = document.createElement('div');
                translatedElement.className = 'translated-text';
                translatedElement.textContent = `Translation: ${translatedText}`;
               
                // Add audio button to translated element
                translatedElement.appendChild(audioButton);
               
                // Replace loading indicator with translation
                messageElement.replaceChild(translatedElement, translationLoading);
               
                // Add click event to play audio of the translated text
                audioButton.addEventListener('click', async () => {
                    audioButton.disabled = true;
                    audioButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                   
                    const audio = await textToSpeech(translatedText, targetLang);
                    if (audio) {
                        audio.play();
                        audio.onended = () => {
                            audioButton.disabled = false;
                            audioButton.innerHTML = '<i class="fas fa-volume-up"></i>';
                        };
                    } else {
                        audioButton.disabled = false;
                        audioButton.innerHTML = '<i class="fas fa-volume-up"></i>';
                    }
                });
               
                // Auto-play the translation
                setTimeout(() => {
                    audioButton.click();
                }, 300);
            } else {
                // Remove loading indicator if translation is same as original
                messageElement.removeChild(translationLoading);
            }
        } catch (error) {
            console.error('Translation error:', error);
           
            // Show error message
            translationLoading.textContent = 'Translation failed';
            translationLoading.className = 'translation-error';
        }
    }

    // Start speech recognition
    function startSpeechRecognition() {
        if (!recognition) {
            initSpeechRecognition();
        } else {
            // Update language in case it changed
            const langCode = languageSelect.value;
            recognition.lang = speechRecognitionLanguages[langCode] || 'en-US';
        }
       
        try {
            recognition.start();
            isRecording = true;
            console.log("Speech recognition started");
        } catch (error) {
            console.error('Error starting recognition:', error);
        }
    }
   
    // Stop speech recognition
    function stopSpeechRecognition() {
        if (recognition && isRecording) {
            try {
                recognition.stop();
                isRecording = false;
                console.log("Speech recognition stopped");
            } catch (error) {
                console.error('Error stopping recognition:', error);
            }
        }
    }
   
    // Toggle mute function
    function toggleMute() {
        isMuted = !isMuted;
       
        if (isMuted) {
            // Stop recognition if it's running
            if (isRecording) {
                stopSpeechRecognition();
            }
           
            // Update button appearance
            muteButton.innerHTML = '<i class="fas fa-microphone-slash"></i> Unmute Microphone';
            muteButton.classList.add('muted');
        } else {
            // Start recognition if we're connected
            if (isConnected && !isRecording) {
                startSpeechRecognition();
            }
           
            // Update button appearance
            muteButton.innerHTML = '<i class="fas fa-microphone"></i> Mute Microphone';
            muteButton.classList.remove('muted');
        }
    }

    // Update connection status
    function setConnectionStatus(message, isConnected) {
        connectionStatus.textContent = message;
        if (isConnected) {
            connectionStatus.classList.add('connected');
            connectionStatus.classList.remove('disconnected');
        } else {
            connectionStatus.classList.add('disconnected');
            connectionStatus.classList.remove('connected');
        }
    }

    // Function to get room ID from URL
    function getRoomIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('room');
    }

    // Function to handle automatic room joining from URL
    function handleRoomFromUrl() {
        const urlRoomId = getRoomIdFromUrl();
        
        if (urlRoomId) {
            console.log("Room ID found in URL:", urlRoomId);
            roomInput.value = urlRoomId;
            // Automatically join the room from URL
            joinRoom(urlRoomId);
        }
    }

    // Event listeners
    joinRoomBtn.addEventListener('click', joinOrCreateRoom);
    muteButton.addEventListener('click', toggleMute);
   
    // Handle Enter key in room input
    roomInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            joinOrCreateRoom();
        }
    });
   
    // Handle language change
    languageSelect.addEventListener('change', () => {
        // If we're recording, restart with new language
        if (isRecording) {
            stopSpeechRecognition();
            setTimeout(() => {
                startSpeechRecognition();
            }, 300);
        }
    });
   
    // Initialize on page load
    initializeLanguageOptions();
    initSpeechRecognition();
   
    // Display welcome message
    const welcomeMessage = document.createElement('div');
    welcomeMessage.className = 'received-message';
    welcomeMessage.innerHTML = `
        <div class="message-header" style="color: #2ecc71">System:</div>
        <div class="original-text">Welcome to Simple Audio Translator!</div>
        <div class="translated-text">1. Select your language<br>2. Enter a Room ID or leave it blank to create a new room<br>3. Share the Room ID with someone to start translating conversations</div>
        <div class="timestamp">${new Date().toLocaleTimeString()}</div>
    `;
    receivedMessages.appendChild(welcomeMessage);

    // Check for room ID in URL and handle it
    handleRoomFromUrl();
});
