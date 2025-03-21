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
    const startButton = document.getElementById('startRecording');
    const stopButton = document.getElementById('stopRecording');
    const transcript = document.getElementById('transcript');
    const recordingStatus = document.getElementById('recordingStatus');
    const sourceLanguageSelect = document.getElementById('sourceLanguage');
    const targetLanguageSelect = document.getElementById('targetLanguage');
    const createRoomBtn = document.getElementById('createRoomBtn');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const roomInput = document.getElementById('roomInput');
    const roomIdDisplay = document.getElementById('roomIdDisplay');
    const connectionStatus = document.getElementById('connectionStatus');
    const receivedMessages = document.getElementById('receivedMessages');
    const translationStatus = document.getElementById('translationStatus');
    const usernameInput = document.getElementById('username');
    const userAvatar = document.getElementById('userAvatar');
    const youSpeakingIndicator = document.getElementById('youSpeakingIndicator');
    const peerSpeakingIndicator = document.getElementById('peerSpeakingIndicator');
    const peerNameElement = document.getElementById('peerName');

    // WebRTC variables
    let roomId = null;
    let signalingRef = null;
    let peerConnection = null;
    let dataChannel = null;
    let isConnected = false;
    let autoPlayAudio = false;
    // Speech recognition variables
    let recognition = null;
    let isRecording = false;
    let currentTranscript = '';
    let isSpeaking = false;
    let speakingTimeout = null;
    let continuousListening = false;
    
    // User information
    let username = 'User_' + Math.floor(Math.random() * 1000);
    let peerName = 'Peer';
    let userColor = getRandomColor();

    // Initialize with default options and then try to fetch more
    function initializeLanguageOptions() {
        // Set default options first
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
        sourceLanguageSelect.innerHTML = '';
        targetLanguageSelect.innerHTML = '';
        
        for (const [code, name] of Object.entries(defaultLanguages)) {
            // Source languages
            const srcOption = document.createElement('option');
            srcOption.value = code + (code === 'en' ? '-US' : 
                            code === 'es' ? '-ES' : 
                            code === 'fr' ? '-FR' : 
                            code === 'de' ? '-DE' : 
                            code === 'ja' ? '-JP' : 
                            code === 'zh-cn' ? '-CN' : 
                            code === 'hi' ? '-IN' : 
                            code === 'ru' ? '-RU' : '');
            srcOption.textContent = name;
            sourceLanguageSelect.appendChild(srcOption);
            
            // Target languages
            const tgtOption = document.createElement('option');
            tgtOption.value = code;
            tgtOption.textContent = name;
            targetLanguageSelect.appendChild(tgtOption);
        }
        
        // Set default values
        sourceLanguageSelect.value = 'en-US';
        targetLanguageSelect.value = 'en';
        
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
    // Update the populateLanguageOptions function
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
            sourceLanguageSelect.innerHTML = '';
            targetLanguageSelect.innerHTML = '';
            
            // Populate source language dropdown (needs country code for speech recognition)
            for (const [code, name] of Object.entries(languages)) {
                const option = document.createElement('option');
                // For speech recognition, we need country code for some languages
                option.value = code + (code === 'en' ? '-US' : 
                                code === 'es' ? '-ES' : 
                                code === 'fr' ? '-FR' : 
                                code === 'de' ? '-DE' : 
                                code === 'ja' ? '-JP' : 
                                code === 'zh-cn' ? '-CN' : 
                                code === 'hi' ? '-IN' : 
                                code === 'ru' ? '-RU' : '');
                option.textContent = name;
                sourceLanguageSelect.appendChild(option);
            }
            
            // Populate target language dropdown
            for (const [code, name] of Object.entries(languages)) {
                const option = document.createElement('option');
                option.value = code;
                option.textContent = name;
                targetLanguageSelect.appendChild(option);
            }
            
            // Set default values
            sourceLanguageSelect.value = 'en-US';
            targetLanguageSelect.value = 'en';
            
            console.log("Language options populated successfully");
        } catch (error) {
            console.error('Error fetching supported languages:', error);
            console.log("Using fallback language options");
            
            // Fallback is already handled by initializeLanguageOptions
        }
    }

    // Initialize user interface
    function initUI() {
        // Set random username
        usernameInput.value = username;
        
        // Set avatar with initials
        updateAvatar();
        
        // Hide speaking indicators
        youSpeakingIndicator.style.display = 'none';
        peerSpeakingIndicator.style.display = 'none';
        
        // Username change event
        usernameInput.addEventListener('input', () => {
            username = usernameInput.value || 'User';
            updateAvatar();
            
            // If connected, send username update to peer
            if (isConnected && dataChannel && dataChannel.readyState === 'open') {
                sendMetadata({
                    type: 'user_info',
                    username: username,
                    color: userColor
                });
            }
        });

        const autoPlayCheckbox = document.getElementById('autoPlayAudio');
        autoPlayCheckbox.checked = autoPlayAudio;
        autoPlayCheckbox.addEventListener('change', () => {
            autoPlayAudio = autoPlayCheckbox.checked;
        });
    }
    
    // Update user avatar with initials
    function updateAvatar() {
        const initials = username.charAt(0).toUpperCase();
        userAvatar.textContent = initials;
        userAvatar.style.backgroundColor = userColor;
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
        updateRecordingStatus('Speech recognition not supported in this browser. Try Chrome or Edge.');
        startButton.disabled = true;
        return;
    }
    
    // Create speech recognition instance
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    
    // Configure recognition
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = sourceLanguageSelect.value;
    
    // Event handlers
    recognition.onstart = () => {
        isRecording = true;
        updateRecordingStatus('Listening continuously...');
        startButton.disabled = true;
        stopButton.disabled = false;
        recordingStatus.classList.add('recording');
    };
    
    recognition.onend = () => {
        // If we're in continuous mode and not manually stopped, restart
        if (isRecording && continuousListening) {
            recognition.start();
            console.log("Restarting speech recognition automatically");
        } else {
            isRecording = false;
            updateRecordingStatus('Stopped listening');
            startButton.disabled = false;
            stopButton.disabled = true;
            recordingStatus.classList.remove('recording');
            
            // Hide speaking indicator
            youSpeakingIndicator.style.display = 'none';
        }
    };
    
    recognition.onerror = (event) => {
        console.error('Speech Recognition Error:', event.error);
        
        // Handle different error types
        if (event.error === 'no-speech') {
            // No speech detected, just log it
            console.log("No speech detected");
        } else if (event.error === 'audio-capture') {
            updateRecordingStatus('Error: No microphone detected');
        } else if (event.error === 'not-allowed') {
            updateRecordingStatus('Error: Microphone permission denied');
        } else {
            updateRecordingStatus(`Error occurred: ${event.error}`);
        }
        
        // If in continuous mode, try to restart after errors
        if (continuousListening && isRecording) {
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
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const text = result[0].transcript;
            
            if (result.isFinal) {
                finalTranscript += text;
                // Process and send final transcript
                processSpeechResult(text);
            } else {
                interimTranscript += text;
                // Show speaking indicator for interim results
                showSpeakingIndicator();
            }
        }
        
        currentTranscript = finalTranscript;
        
        // Display the transcript
        transcript.innerHTML = finalTranscript +
            '<span style="color: #999;">' + interimTranscript + '</span>';
    };
}


    // Add a new function for language detection
    async function detectLanguage(text) {
        try {
            const response = await fetch('https://realtime-translation-app-production.up.railway.app/detect_language', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();
            return data.language; // Assuming the API returns a language code
        } catch (error) {
            console.error('Language Detection API error:', error);
            // Fallback to source language selection if detection fails
            return sourceLanguageSelect.value.split('-')[0];
        }
    }

    // Modify the processSpeechResult function to only send the original text
    async function processSpeechResult(text) {
        // Show the speaking indicator
        showSpeakingIndicator();

        try {
            // Detect the language of the spoken text
            const detectedSourceLang = await detectLanguage(text);

            // Print the detected language to the console
            console.log('🌐 Detected Language:', detectedSourceLang);

            // Send only the original text and detected language to peer
            sendTranscriptToPeer({
                original: text,
                sourceLang: detectedSourceLang,
                detectedLanguage: true
            });

            updateTranslationStatus('Message sent');
        } catch (error) {
            console.error('Language detection error:', error);
            updateTranslationStatus('Error detecting language');

            // Send original text if detection fails
            sendTranscriptToPeer({
                original: text,
                sourceLang: sourceLanguageSelect.value.split('-')[0],
                error: true
            });
        }
    }

    // Show speaking indicator with timeout
    function showSpeakingIndicator() {
        youSpeakingIndicator.style.display = 'block';
        
        // Clear previous timeout
        if (speakingTimeout) {
            clearTimeout(speakingTimeout);
        }
        
        // Set timeout to hide indicator after 2 seconds of silence
        speakingTimeout = setTimeout(() => {
            youSpeakingIndicator.style.display = 'none';
        }, 2000);
        
        // Notify peer that user is speaking
        if (isConnected && dataChannel && dataChannel.readyState === 'open') {
            sendMetadata({
                type: 'speaking_status',
                isSpeaking: true
            });
        }
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
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        });

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log("🟢 ICE Candidate Generated:", event.candidate);
                signalingRef.child("candidates").push(event.candidate.toJSON());
            }
        };

        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            console.log("Connection state:", peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
                setConnectionStatus('Connected', true);
                isConnected = true;
                startButton.disabled = false;
                
                // Send user info once connected
                setTimeout(() => {
                    sendMetadata({
                        type: 'user_info',
                        username: username,
                        color: userColor
                    });
                }, 1000);
            } else if (peerConnection.connectionState === 'disconnected' ||
                       peerConnection.connectionState === 'failed') {
                setConnectionStatus('Disconnected', false);
                isConnected = false;
                startButton.disabled = true;
                stopButton.disabled = true;
                peerSpeakingIndicator.style.display = 'none';
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
            startButton.disabled = false;
            
            // Send user info once channel is open
            sendMetadata({
                type: 'user_info',
                username: username,
                color: userColor
            });
        };

        dataChannel.onmessage = (event) => {
            console.log("📩 Message Received:", event.data);
            
            try {
                const data = JSON.parse(event.data);
                
                // Handle different message types
                if (data.type === 'transcript') {
                    displayReceivedTranscript(data);
                } else if (data.type === 'user_info') {
                    updatePeerInfo(data);
                } else if (data.type === 'speaking_status') {
                    updatePeerSpeakingStatus(data.isSpeaking);
                }
            } catch (error) {
                console.error('Error parsing message:', error);
                // If not JSON, display as plain text
                displayReceivedMessage(event.data);
            }
        };

        dataChannel.onclose = () => {
            console.log("❌ DataChannel Closed!");
            setConnectionStatus('Disconnected', false);
            isConnected = false;
            startButton.disabled = true;
            stopButton.disabled = true;
            peerSpeakingIndicator.style.display = 'none';
        };
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
                console.log("✅ Data Channel Created:", dataChannel);
        
                peerConnection.createOffer().then(offer => {
                    return peerConnection.setLocalDescription(offer).then(() => {
                        console.log("📡 Offer Created & Set as Local Description:", offer);
                        return signalingRef.child("offer").set(offer);
                    });
                }).then(() => {
                    console.log("✅ Offer stored in Firebase, waiting for answer...");
        
                    // Listen for answer
                    signalingRef.child("answer").on("value", async (snapshot) => {
                        if (snapshot.exists() && !peerConnection.remoteDescription) {
                            console.log("📡 Answer Received:", snapshot.val());
                            await peerConnection.setRemoteDescription(new RTCSessionDescription(snapshot.val()));
                        }
                    });
        
                    // Listen for ICE candidates
                    signalingRef.child("candidates").on("child_added", async (snapshot) => {
                        console.log("📡 ICE Candidate Received:", snapshot.val());
                        if (snapshot.exists() && peerConnection.remoteDescription) {
                            await peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val()));
                        }
                    });
        
                }).catch(error => console.error("❌ Error creating offer:", error));
            }
        
            function joinRoom() {
                const inputRoomId = roomInput.value.trim();
                if (!inputRoomId) {
                    alert("Please enter a valid Room ID!");
                    return;
                }
        
                roomId = inputRoomId;
                signalingRef = db.ref(`webrtc_signaling/${roomId}`);
                roomIdDisplay.innerText = roomId;
                setConnectionStatus('Connecting...', false);
        
                initializeWebRTC();
        
                signalingRef.child("offer").once("value").then(async snapshot => {
                    if (snapshot.exists()) {
                        console.log("📡 Offer Found in Firebase:", snapshot.val());
        
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(snapshot.val()));
                        console.log("✅ Remote Description Set");
        
                        const answer = await peerConnection.createAnswer();
                        await peerConnection.setLocalDescription(answer);
                        console.log("📡 Answer Created & Set as Local Description:", answer);
        
                        await signalingRef.child("answer").set(answer);
                        console.log("✅ Answer stored in Firebase");
        
                    } else {
                        console.error("❌ No offer found in Firebase for Room ID:", roomId);
                        alert("Room not found or invalid Room ID!");
                        setConnectionStatus('Disconnected', false);
                    }
        
                    // Listen for ICE candidates
                    signalingRef.child("candidates").on("child_added", async (snapshot) => {
                        console.log("📡 ICE Candidate Received:", snapshot.val());
                        if (snapshot.exists() && peerConnection.remoteDescription) {
                            await peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val()));
                        }
                    });
        
                }).catch(error => {
                    console.error("❌ Error joining room:", error);
                    alert("Error joining room: " + error.message);
                });
            }
        
            // Modify the sendTranscriptToPeer function
            function sendTranscriptToPeer(transcriptData) {
                if (dataChannel && dataChannel.readyState === "open") {
                    console.log("📤 Sending transcript:", transcriptData);
                    
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
            
            // Send metadata to peer
            function sendMetadata(metadata) {
                if (dataChannel && dataChannel.readyState === "open") {
                    console.log("📤 Sending metadata:", metadata);
                    dataChannel.send(JSON.stringify(metadata));
                }
            }
        
            // Modify the displayReceivedTranscript function to include audio playback
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
                
                // Add a loading indicator for translation
                const translationLoading = document.createElement('div');
                translationLoading.className = 'translation-loading';
                translationLoading.textContent = 'Translating...';
                messageElement.appendChild(translationLoading);
                
                // Add timestamp
                const timestamp = document.createElement('div');
                timestamp.className = 'timestamp';
                timestamp.textContent = new Date().toLocaleTimeString();
                messageElement.appendChild(timestamp);
                
                // Add to DOM immediately to show original text
                receivedMessages.appendChild(messageElement);
                receivedMessages.scrollTop = receivedMessages.scrollHeight;
                
                // Show peer speaking indicator
                updatePeerSpeakingStatus(true);
                
                // Get target language
                const targetLang = targetLanguageSelect.value;
                
                // Translate the text at the receiver end
                try {
                    const translatedText = await translateText(data.original, data.sourceLang, targetLang);
                    
                    // Replace loading indicator with translated text
                    if (translatedText && translatedText !== data.original) {
                        const translatedElement = document.createElement('div');
                        translatedElement.className = 'translated-text';
                        translatedElement.textContent = `Translation: ${translatedText}`;
                        
                        // Add play button for audio
                        const audioButton = document.createElement('button');
                        audioButton.className = 'audio-btn';
                        audioButton.innerHTML = '<i class="fas fa-volume-up"></i>';
                        audioButton.title = 'Play translation audio';
                        
                        // Add click event to play audio
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
                        
                        translatedElement.appendChild(audioButton);
                        
                        // Replace loading indicator with translation
                        messageElement.replaceChild(translatedElement, translationLoading);
                        
                        // Auto-play the translation if enabled
                        if (autoPlayAudio) {
                            setTimeout(() => {
                                audioButton.click();
                            }, 300);
                        }
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
            
            // Display simple received message (fallback)
            function displayReceivedMessage(message) {
                const messageElement = document.createElement('div');
                messageElement.className = 'received-message';
                messageElement.textContent = message;
                
                receivedMessages.appendChild(messageElement);
                receivedMessages.scrollTop = receivedMessages.scrollHeight;
            }
            
            // Update peer information
            function updatePeerInfo(data) {
                peerName = data.username || 'Peer';
                peerNameElement.textContent = peerName;
                
                // Update peer speaking indicator with name
                peerSpeakingIndicator.innerHTML = `<i class="fas fa-volume-up"></i> ${peerName} is speaking...`;
            }
            
            // Update peer speaking status
            function updatePeerSpeakingStatus(isSpeaking) {
                if (isSpeaking) {
                    peerSpeakingIndicator.style.display = 'block';
                    
                    // Auto-hide after 2 seconds if no updates
                    setTimeout(() => {
                        peerSpeakingIndicator.style.display = 'none';
                    }, 2000);
                } else {
                    peerSpeakingIndicator.style.display = 'none';
                }
            }
        
            // Start recording
            function startRecording() {
                if (!recognition) {
                    initSpeechRecognition();
                }
                
                try {
                    recognition.lang = sourceLanguageSelect.value;
                    recognition.start();
                    
                    // If in continuous mode, update the status accordingly
                    if (continuousListening) {
                        updateRecordingStatus('Continuous listening active');
                    }
                } catch (error) {
                    console.error('Error starting recognition:', error);
                    updateRecordingStatus('Error starting recognition. Please try again.');
                }
            }
            
            // Stop recording
            function stopRecording() {
                if (recognition && isRecording) {
                    // If we're stopping, make sure to disable continuous mode
                    if (continuousListening) {
                        continuousListening = false;
                        document.getElementById('continuousListening').checked = false;
                    }
                    
                    recognition.stop();
                }
            }
            
            // Update recording status message
            function updateRecordingStatus(message) {
                recordingStatus.textContent = message;
            }
            
            // Update translation status
            function updateTranslationStatus(message) {
                translationStatus.textContent = message;
                
                // Clear status after 3 seconds
                setTimeout(() => {
                    if (translationStatus.textContent === message) {
                        translationStatus.textContent = '';
                    }
                }, 3000);
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
            
            // Event listeners
            startButton.addEventListener('click', startRecording);
            stopButton.addEventListener('click', stopRecording);
            createRoomBtn.addEventListener('click', createRoom);
            joinRoomBtn.addEventListener('click', joinRoom);
            
            // Update language when selection changes
            sourceLanguageSelect.addEventListener('change', () => {
                if (recognition) {
                    const wasRecording = isRecording;
                    
                    if (wasRecording) {
                        stopRecording();
                    }
                    
                    recognition.lang = sourceLanguageSelect.value;
                    
                    if (wasRecording) {
                        setTimeout(() => {
                            startRecording();
                        }, 200);
                    }
                }
            });
            
            // Initialize on page load
            initializeLanguageOptions();
            initSpeechRecognition();
            initUI();
        });
        