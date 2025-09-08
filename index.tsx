import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Modality, Type } from "@google/genai";

const API_KEY = process.env.API_KEY;
const NUM_FRAMES_TO_GENERATE = 6;

// Declare gif.js as a global variable for TypeScript
declare var GIF: any;

// --- Helper Functions ---
const fileToGenerativePart = async (file) => {
  const base64EncodedDataPromise = new Promise((resolve) => {
    const reader = new FileReader();
    // Fix: Cast reader.result to string to resolve TypeScript error on 'split'.
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
};

const base64ToGenerativePart = (base64Data, mimeType) => ({
    inlineData: { data: base64Data, mimeType },
});

// --- UI Components ---

const ImageWithBoundingBoxes = ({ src, objects, selectedObjectName }) => {
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setContainerSize({ width, height });
      }
    });

    const currentRef = containerRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, []);

  return (
    <div className="image-analysis-container" ref={containerRef}>
      <img src={src} alt="User upload" className="original-image" />
      {containerSize.width > 0 && objects.length > 0 && (
        <svg className="bounding-box-overlay">
          {objects.map((obj, index) => {
            if (!obj.boundingBox) return null;
            const isSelected = obj.name === selectedObjectName;
            const x = obj.boundingBox.x * containerSize.width;
            const y = obj.boundingBox.y * containerSize.height;
            const width = obj.boundingBox.width * containerSize.width;
            const height = obj.boundingBox.height * containerSize.height;
            
            return (
              <g key={index}>
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  className={`bounding-box ${isSelected ? 'selected' : ''}`}
                />
                <text
                  x={x + 5}
                  y={y + 20}
                  className="bounding-box-label"
                >
                  {obj.name}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
};


const FlickerBook = ({ frames, playbackSpeed, onSpeedChange }) => {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const intervalRef = useRef(null);
  const audioCtxRef = useRef(null);
  const isFirstRun = useRef(true);

  const playFlipSound = useCallback(() => {
    if (isMuted) return;

    if (!audioCtxRef.current) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
            audioCtxRef.current = new AudioContext();
        } else {
            console.warn("Web Audio API is not supported in this browser.");
            return;
        }
    }
    const audioCtx = audioCtxRef.current;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(800, audioCtx.currentTime); 
    gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);

    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.05);
  }, [isMuted]);

  useEffect(() => {
    if (isFirstRun.current) {
        isFirstRun.current = false;
        return;
    }
    playFlipSound();
  }, [currentFrame, playFlipSound]);
  
  const startPlayback = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const intervalDuration = 1000 / (playbackSpeed * 10); // More intuitive speed mapping
    intervalRef.current = setInterval(() => {
      setCurrentFrame(prev => (prev + 1) % frames.length);
    }, intervalDuration); 
  }, [frames.length, playbackSpeed]);

  const stopPlayback = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  useEffect(() => {
    if (isPlaying) {
      startPlayback();
    } else {
      stopPlayback();
    }
    return () => stopPlayback();
  }, [isPlaying, startPlayback, stopPlayback]);

  useEffect(() => {
    setCurrentFrame(0);
    setIsPlaying(true);
    isFirstRun.current = true;
  }, [frames]);
  
  const handleScrubberChange = (e) => {
    setIsPlaying(false);
    setCurrentFrame(Number(e.target.value));
  };

  const togglePlay = () => {
    setIsPlaying(prev => !prev);
  };
  
  const handleSpeedChange = (e) => {
      onSpeedChange(Number(e.target.value));
  };
  
  const toggleMute = () => {
      setIsMuted(prev => !prev);
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume();
      }
  };

  if (!frames || frames.length === 0) return null;

  return (
    <div className="flicker-book-container">
      <img 
        src={`data:image/png;base64,${frames[currentFrame]}`} 
        alt={`Frame ${currentFrame + 1}`} 
        className="flicker-book-image"
      />
      <div className="flicker-book-controls">
        <button onClick={togglePlay} className="play-pause-btn" aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? '❚❚' : '►'}
        </button>
        <button onClick={toggleMute} className="mute-btn" aria-label={isMuted ? 'Unmute' : 'Mute'}>
          {isMuted ? '🔇' : '🔊'}
        </button>
        <input
          type="range"
          min="0"
          max={frames.length - 1}
          value={currentFrame}
          onChange={handleScrubberChange}
          className="scrubber"
          aria-label="Frame scrubber"
        />
      </div>
      <div className="speed-control">
        <label htmlFor="speed-scrubber">Speed</label>
        <input
            id="speed-scrubber"
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={playbackSpeed}
            onChange={handleSpeedChange}
            className="scrubber"
            aria-label="Playback speed"
        />
        <span className="speed-indicator">{playbackSpeed.toFixed(1)}x</span>
      </div>
    </div>
  );
};

const triviaFacts = [
  "Nano Banana is now the offical name for Google's gemini-2.5-flash-image-preview model!!",
  "Each frame is generated by showing the previous frame to the AI, like a digital game of telephone.",
  "Flip books, also known as kineographs, were patented in 1868.",
  "The smoothness of a flip book depends on the subtle differences between each page.",
  "AI image generation uses complex math to turn your text prompts into pixels.",
  "This app uses a multimodal model, which means it can understand both text and images at the same time.",
  "The model doesn't 'see' an image like we do. It converts it into complex numbers (vectors) to understand it.",
  "The effect where images slowly change is called 'Generational Drift'—it's like a game of telephone with pictures!",
  "The AI is making its best creative guess to continue the motion based on the previous frame.",
  "This stop-motion process is similar to early animation, but with AI instead of a paintbrush."
];

const App = () => {
  const [uploadedImage, setUploadedImage] = useState(null);
  const [detectedObjects, setDetectedObjects] = useState([]);
  const [animationPrompts, setAnimationPrompts] = useState([]);
  const [generatedFrames, setGeneratedFrames] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState(null);
  const [currentTrivia, setCurrentTrivia] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedObject, setSelectedObject] = useState(null);
  const [detectionComplete, setDetectionComplete] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isGeneratingGif, setIsGeneratingGif] = useState(false);
  const [copiedPromptIndex, setCopiedPromptIndex] = useState(-1);
  const [gifFps, setGifFps] = useState(10);
  const [gifProgress, setGifProgress] = useState(0);
  const gifWorkerUrlRef = useRef(null);

  
  const ai = new GoogleGenAI({ apiKey: API_KEY });

  useEffect(() => {
    let triviaInterval = null;
    if (isLoading) {
      setCurrentTrivia(triviaFacts[Math.floor(Math.random() * triviaFacts.length)]);
      triviaInterval = setInterval(() => {
        setCurrentTrivia(triviaFacts[Math.floor(Math.random() * triviaFacts.length)]);
      }, 6000);
    }
    return () => {
      if (triviaInterval) {
        clearInterval(triviaInterval);
      }
    };
  }, [isLoading]);

  // Effect to fetch and create a local URL for the GIF worker script to avoid CORS issues
  useEffect(() => {
    const createWorkerUrl = async () => {
        try {
            const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');
            if (!response.ok) throw new Error('Network response was not ok for gif.worker.js.');
            const scriptText = await response.text();
            const blob = new Blob([scriptText], { type: 'application/javascript' });
            gifWorkerUrlRef.current = URL.createObjectURL(blob);
        } catch (error) {
            console.error('Failed to create GIF worker URL:', error);
            setError("Could not initialize GIF generation components.");
        }
    };

    createWorkerUrl();

    return () => {
        if (gifWorkerUrlRef.current) {
            URL.revokeObjectURL(gifWorkerUrlRef.current);
        }
    };
  }, []);


  const resetState = () => {
    setUploadedImage(null);
    setDetectedObjects([]);
    setAnimationPrompts([]);
    setGeneratedFrames([]);
    setIsLoading(false);
    setLoadingMessage('');
    setError(null);
    setSelectedObject(null);
    setDetectionComplete(false);
    setIsGeneratingGif(false);
    setCopiedPromptIndex(-1);
    setGifProgress(0);
  };
  
  const processUploadedFile = async (file) => {
      if (!file || !file.type.startsWith('image/')) {
        setError("Please upload a valid image file.");
        return;
      }
      resetState();
      setIsLoading(true);
      try {
        const imageUrl = URL.createObjectURL(file);
        setUploadedImage({ url: imageUrl, file });
        await runObjectDetection(file);
      } catch (err) {
        console.error(err);
        setError(`An unexpected error occurred: ${err.message}`);
        setIsLoading(false);
      }
    };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      await processUploadedFile(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoading) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isLoading) return;

    const file = e.dataTransfer.files[0];
    if (file) {
      await processUploadedFile(file);
    }
  };
  
  const runObjectDetection = async (file) => {
    const imagePart = await fileToGenerativePart(file);
    setLoadingMessage('Analyzing image to find prominent objects...');
    
    try {
        const objects = await detectObjects(imagePart);
        if (objects && objects.length > 0) {
            setDetectedObjects(objects);
            setSelectedObject(objects[0]); // Select first object by default
            setDetectionComplete(true);
        } else {
            setError("Sorry, no distinct objects could be identified in the image. Please try another one.");
        }
    } catch (err) {
        console.error("Error during object detection:", err);
        setError(err.message);
    } finally {
        setIsLoading(false);
        setLoadingMessage('');
    }
  };

  const handleGenerateAnimation = async () => {
    if (!selectedObject || !uploadedImage) {
        setError("Please select an object to animate.");
        return;
    }
    setIsLoading(true);
    setError(null);
    try {
        const imagePart = await fileToGenerativePart(uploadedImage.file);
        const initialFrameBase64 = imagePart.inlineData.data;

        setLoadingMessage(`Generating animation ideas for "${selectedObject.name}"...`);
        const prompts = await generatePrompts(selectedObject.name, imagePart);
        
        const subsequentFrames = await generateFrames(imagePart, prompts);
        
        setAnimationPrompts(["Original Image", ...prompts]);
        setGeneratedFrames([initialFrameBase64, ...subsequentFrames]);

    } catch (err) {
        console.error("Error during animation generation:", err);
        setError(err.message);
    } finally {
        setIsLoading(false);
        setLoadingMessage('');
    }
  };

  const detectObjects = async (imagePart) => {
    const promptText = `Analyze this image and identify up to 5 prominent objects. For each object, provide its name and a normalized bounding box. The bounding box should have 'x', 'y', 'width', and 'height' properties, where 'x' and 'y' represent the top-left corner and all values are floats between 0.0 and 1.0. CRITICAL: Your entire response must be ONLY the raw JSON array of these objects, without any markdown, comments, or other text. Example: [{"name": "cat", "boundingBox": {"x": 0.15, "y": 0.22, "width": 0.30, "height": 0.45}}]`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: {
          parts: [{ text: promptText }, imagePart],
        },
        // The gemini-2.5-flash-image-preview model does not support responseSchema, so we must parse the text response.
    });
      
    let jsonText = response.text.trim();

    // The model might wrap the JSON in markdown, so we extract it.
    const jsonMatch = jsonText.match(/```json\n([\s\S]*?)\n```|(\[[\s\S]*?{.*}[\s\S]*?\])/);
    if (jsonMatch) {
        jsonText = jsonMatch[1] || jsonMatch[2];
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(jsonText);
    } catch (e) {
      console.error("Failed to parse JSON from detectObjects:", jsonText, "Original response text:", response.text);
      throw new Error("Received an invalid response from the AI when detecting objects. Please try a different image.");
    }

    if (!Array.isArray(parsedResponse)) {
      throw new Error("Failed to detect objects in the required format.");
    }
    return parsedResponse;
  };

  const generatePrompts = async (prominentObjectName, imagePart) => {
    const prompt = `Analyze the provided image which contains a '${prominentObjectName}'. Your task is to generate a sequence of ${NUM_FRAMES_TO_GENERATE} distinct, incremental prompts to animate ONLY this object. CRITICAL INSTRUCTIONS: 1. Each prompt must describe a very small, subtle, and logical change to '${prominentObjectName}' to create smooth motion. 2. The background and all other elements in the image MUST remain IDENTICAL to the previous frame. Do NOT mention the background. Focus only on the object's change. 3. Your entire response must be ONLY the raw JSON array of ${NUM_FRAMES_TO_GENERATE} strings, without any markdown, comments, or other text.`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: {
            parts: [{ text: prompt }, imagePart],
        },
    });

    let jsonText = response.text.trim();

    // The model might wrap the JSON in markdown, so we extract it.
    const jsonMatch = jsonText.match(/```json\n([\s\S]*?)\n```|(\[[\s\S]*?\])/);
    if (jsonMatch) {
        jsonText = jsonMatch[1] || jsonMatch[2];
    }

    let parsedResponse;
    try {
        parsedResponse = JSON.parse(jsonText);
    } catch (e) {
        console.error("Failed to parse JSON from generatePrompts:", jsonText, "Original response text:", response.text);
        throw new Error("Received an invalid response from the AI when generating prompts.");
    }

    if (!Array.isArray(parsedResponse) || parsedResponse.length === 0) {
      throw new Error("Failed to generate prompts in the required format.");
    }
    return parsedResponse;
  };

  const generateFrames = async (initialImagePart, prompts) => {
    let currentImagePart = initialImagePart;
    const allFrames = [];
    let lastSuccessfulBase64 = initialImagePart.inlineData.data;

    for (let i = 0; i < prompts.length; i++) {
        setLoadingMessage(`Creating animation frame ${i + 2} of ${prompts.length + 1}...`);
        
        const maxRetries = 3;
        let attempt = 0;
        let delay = 2000; // Start with a 2-second delay
        let success = false;
        let newBase64Data;
        let newMimeType = currentImagePart.inlineData.mimeType;

        while (attempt < maxRetries && !success) {
            try {
                const generationPrompt = `${prompts[i]}. IMPORTANT: The background and all elements, except for the object being animated, MUST remain identical to the input image. Do not change the scene, lighting, or style.`;

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image-preview',
                    contents: {
                        parts: [
                            currentImagePart,
                            { text: generationPrompt }
                        ],
                    },
                    config: {
                        responseModalities: [Modality.IMAGE, Modality.TEXT],
                    },
                });

                const imagePartResponse = response.candidates?.[0]?.content?.parts.find(part => part.inlineData);
                
                if (imagePartResponse?.inlineData?.data) {
                    newBase64Data = imagePartResponse.inlineData.data;
                    newMimeType = imagePartResponse.inlineData.mimeType;
                    lastSuccessfulBase64 = newBase64Data;
                    success = true;
                } else {
                     let reason = response.candidates?.[0]?.finishReason || "Unknown reason";
                     throw new Error(`Failed to generate image data in response. Reason: ${reason}`);
                }
            } catch (error) {
                attempt++;
                if (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED')) {
                    if (attempt >= maxRetries) {
                        console.error(`Max retries reached for frame ${i + 1}. Using fallback.`, error);
                        newBase64Data = lastSuccessfulBase64;
                        success = true; 
                    } else {
                        console.warn(`Rate limit hit for frame ${i + 1}. Retrying in ${delay / 1000}s... (Attempt ${attempt}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 2; // Exponential backoff
                    }
                } else {
                    console.error(`An error occurred while generating frame ${i + 1}:`, error);
                    newBase64Data = lastSuccessfulBase64;
                    success = true; 
                }
            }
        }
        
        if (!success) {
            newBase64Data = lastSuccessfulBase64;
        }

        allFrames.push(newBase64Data);
        currentImagePart = base64ToGenerativePart(newBase64Data, newMimeType);
    }
    return allFrames;
  };

  const downloadImage = (base64Data, index) => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${base64Data}`;
    link.download = `frame_${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyPrompt = (promptText, index) => {
    navigator.clipboard.writeText(promptText);
    setCopiedPromptIndex(index);
    setTimeout(() => setCopiedPromptIndex(-1), 2000);
  };

  const handleDownloadGif = async () => {
    if (isGeneratingGif || generatedFrames.length === 0) return;

    if (!gifWorkerUrlRef.current) {
        setError("GIF generation components are still loading. Please try again in a moment.");
        console.error("GIF worker URL not available.");
        return;
    }

    setIsGeneratingGif(true);
    setGifProgress(0);

    try {
        const loadImage = (base64: string): Promise<HTMLImageElement> => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = (err) => reject(err);
                img.src = `data:image/png;base64,${base64}`;
            });
        };

        const imageElements = await Promise.all(generatedFrames.map(loadImage));

        if (imageElements.length === 0) {
            setIsGeneratingGif(false);
            return;
        }

        // Get dimensions from the first frame to ensure the GIF canvas is sized correctly.
        const firstImage = imageElements[0];
        const { naturalWidth: width, naturalHeight: height } = firstImage;
        
        // Create a canvas to normalize frame dimensions and avoid sizing issues.
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error("Could not create canvas context to generate GIF.");
        }

        const gif = new GIF({
            workers: 2,
            quality: 10,
            workerScript: gifWorkerUrlRef.current,
            width,
            height,
        });

        const frameDelay = 1000 / gifFps; // Delay in ms, based on selected FPS
        
        // Draw each image onto the canvas before adding it to the GIF.
        for (const img of imageElements) {
            ctx.drawImage(img, 0, 0, width, height);
            // Add the canvas context's data, copying it for each frame.
            gif.addFrame(ctx, { copy: true, delay: frameDelay });
        }

        gif.on('progress', (p) => {
            setGifProgress(Math.round(p * 100));
        });

        gif.on('finished', (blob) => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'flickerfy-animation.gif';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setIsGeneratingGif(false);
            setGifProgress(0);
        });

        gif.render();
    } catch (err) {
        console.error("Error creating or rendering GIF:", err);
        setError("Could not generate GIF due to a processing error.");
        setIsGeneratingGif(false);
        setGifProgress(0);
    }
  };


  return (
    <div className="app-container">
      <h1>Flickerfy - Nano Banana Powered Flipbook Creator</h1>
      <p>Upload a photo, select an object, and watch it come to life in a stop-motion animation.</p>
      
      {!detectionComplete && (
        <div 
          className={`upload-section ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <label 
            htmlFor="file-input" 
            className="file-input-label" 
            style={{ pointerEvents: isLoading ? 'none' : 'auto' }}
          >
            {isLoading ? 'Processing...' : 'Click to Upload'}
          </label>
          <input id="file-input" type="file" accept="image/*" onChange={handleImageUpload} disabled={isLoading} />
          {!isLoading && <p className="upload-prompt">or drag and drop an image</p>}
        </div>
      )}

      {isLoading && (
        <div className="loading-section">
          <div className="spinner"></div>
          <p>{loadingMessage}</p>
          {currentTrivia && (
              <div className="trivia-section">
                <p>🍌 <strong>Nano Banana Trivia:</strong> {currentTrivia}</p>
              </div>
            )}
        </div>
      )}

      {error && <p className="error-message">{error}</p>}

      <div className="results-section">
        {(detectionComplete || generatedFrames.length > 0) && !isLoading && (
          <>
            <div className="start-over-container">
              <button onClick={resetState} className="start-over-btn">
                Start Over
              </button>
            </div>
            <div className="results-top-row">
              {detectionComplete && (
                <div className="result-group">
                  <h2>Original Image & Analysis</h2>
                  <p>Select an object below to animate.</p>
                  <ImageWithBoundingBoxes 
                    src={uploadedImage.url} 
                    objects={detectedObjects} 
                    selectedObjectName={selectedObject?.name}
                  />
                  <div className="object-selection-group">
                    <div className="objects-list">
                      {detectedObjects.map((obj, i) => (
                        <button 
                          key={i} 
                          className={`object-tag ${selectedObject?.name === obj.name ? 'selected' : ''}`}
                          onClick={() => setSelectedObject(obj)}
                        >
                          {obj.name}
                        </button>
                      ))}
                    </div>
                    {generatedFrames.length === 0 && (
                      <button onClick={handleGenerateAnimation} className="generate-btn">
                        Generate Animation
                      </button>
                    )}
                  </div>
                </div>
              )}
              {generatedFrames.length > 0 && (
                <div className="result-group">
                  <div className="result-group-header">
                    <h2>Generated Flipbook</h2>
                    <div className="gif-controls">
                        <div className="gif-fps-control">
                            <label htmlFor="gif-fps">GIF FPS</label>
                            <input
                                id="gif-fps"
                                type="range"
                                min="1"
                                max="30"
                                step="1"
                                value={gifFps}
                                onChange={(e) => setGifFps(Number(e.target.value))}
                                disabled={isGeneratingGif}
                                className="scrubber"
                            />
                            <span className="gif-fps-indicator">{gifFps}</span>
                        </div>
                        <button 
                          onClick={handleDownloadGif} 
                          className="download-gif-btn"
                          disabled={isGeneratingGif}
                        >
                          {isGeneratingGif ? `Generating... ${gifProgress}%` : 'Download as GIF'}
                        </button>
                    </div>
                  </div>
                  <FlickerBook 
                    frames={generatedFrames} 
                    playbackSpeed={playbackSpeed} 
                    onSpeedChange={setPlaybackSpeed}
                  />
                </div>
              )}
            </div>
            
            {generatedFrames.length > 0 && (
                <div className="result-group full-width-group">
                  <h2>Animation Frames</h2>
                  <div className="frames-gallery">
                    {generatedFrames.map((frame, index) => (
                      <div key={index} className="frame-container">
                        <img src={`data:image/png;base64,${frame}`} alt={`Frame ${index + 1}`} className="frame-image" />
                         <div className="frame-info">
                            <p className="frame-prompt">
                              {animationPrompts[index]}
                            </p>
                            <div className="frame-actions">
                                {index > 0 && (
                                    <button
                                        onClick={() => handleCopyPrompt(animationPrompts[index], index)}
                                        className="frame-action-btn copy-btn"
                                    >
                                        {copiedPromptIndex === index ? 'Copied!' : 'Copy Prompt'}
                                    </button>
                                )}
                                <button 
                                    onClick={() => downloadImage(frame, index)} 
                                    className="frame-action-btn download-btn" 
                                >
                                    Download Frame
                                </button>
                            </div>
                          </div>
                      </div>
                    ))}
                  </div>
                </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);