<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';

  let mediaRecorder: MediaRecorder;
  let recordedChunks: Blob[] = [];
  let videoEl: HTMLVideoElement;
  let startBtn: HTMLButtonElement;
  let stopBtn: HTMLButtonElement;
  let proxyBtn: HTMLButtonElement;
  let isUploading = false;
  let uploadStatus = '';
  let uploadProgress = 0;
  let useProxy = false;
  let uploadStartTime = 0;
  let elapsedTimeInterval: number;

  onMount(() => {
    videoEl = document.getElementById('preview') as HTMLVideoElement;
    startBtn = document.getElementById('startBtn') as HTMLButtonElement;
    stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
    proxyBtn = document.getElementById('proxyBtn') as HTMLButtonElement;
  });

  async function initCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoEl.srcObject = stream;
      return stream;
    } catch (error) {
      console.error('Error accessing camera:', error);
      uploadStatus = 'Error accessing camera. Please check permissions.';
      return null;
    }
  }

  async function startRecording() {
    const stream = await initCamera();
    if (!stream) return;

    recordedChunks = [];
    
    // Try to use MP4 container format with H.264 video codec
    const options = { 
      mimeType: 'video/mp4'
    };
    
    // If MP4 is not supported, try other formats in order of preference
    if (!MediaRecorder.isTypeSupported('video/mp4')) {
      if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) {
        options.mimeType = 'video/webm;codecs=h264';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        options.mimeType = 'video/webm';
      }
    }
    
    console.log(`Using MIME type: ${options.mimeType}`);
    mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const mimeType = mediaRecorder.mimeType || 'video/webm';
      const blob = new Blob(recordedChunks, { type: mimeType });
      uploadVideo(blob);
    };

    mediaRecorder.start();
    
    // Use GSAP for button state animation
    gsap.to(startBtn, { autoAlpha: 0.5, duration: 0.3 });
    gsap.to(stopBtn, { autoAlpha: 1, duration: 0.3 });
    
    startBtn.disabled = true;
    stopBtn.disabled = false;
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      
      // Use GSAP for button state animation
      gsap.to(startBtn, { autoAlpha: 1, duration: 0.3 });
      gsap.to(stopBtn, { autoAlpha: 0.5, duration: 0.3 });
      
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
  }

  async function uploadVideo(blob: Blob) {
    isUploading = true;
    uploadStatus = 'Preparing upload...';
    uploadProgress = 0;
    uploadStartTime = Date.now();
    
    // Start a timer to update elapsed time
    if (elapsedTimeInterval) {
      clearInterval(elapsedTimeInterval);
    }
    
    elapsedTimeInterval = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - uploadStartTime) / 1000);
      const minutes = Math.floor(elapsedSeconds / 60);
      const seconds = elapsedSeconds % 60;
      uploadStatus = `Uploading... (${minutes}m ${seconds}s)`;
      
      // Simulate progress for user feedback
      if (uploadProgress < 95) {
        uploadProgress += 0.2;
        // Use GSAP for smooth progress animation
        gsap.to('.progress-bar-inner', { 
          width: `${uploadProgress}%`, 
          duration: 0.3,
          ease: 'power1.out'
        });
      }
    }, 1000) as unknown as number;
    
    // Determine the correct file extension based on MIME type
    let fileExtension = 'webm';
    if (blob.type.includes('mp4')) {
      fileExtension = 'mp4';
    } else if (blob.type.includes('quicktime') || blob.type.includes('mov')) {
      fileExtension = 'mov';
    }
    
    const formData = new FormData();
    formData.append('video', blob, `recorded_video.${fileExtension}`);

    try {
      const endpoint = useProxy ? '/api/videos/proxy-upload' : '/api/videos/upload';
      uploadStatus = 'Uploading to server...';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      // Clear the interval once upload is complete
      if (elapsedTimeInterval) {
        clearInterval(elapsedTimeInterval);
      }
      
      // Set progress to 100% when complete
      uploadProgress = 100;
      gsap.to('.progress-bar-inner', { 
        width: '100%', 
        duration: 0.5,
        ease: 'power1.out'
      });

      const result = await response.json();
      console.log('Upload successful:', result);
      
      if (result.success) {
        if (result.data.localPath) {
          uploadStatus = `Upload complete! Video saved locally at: ${result.data.localPath}`;
        } else {
          uploadStatus = `Upload successful via ${useProxy ? 'proxy' : 'direct'} endpoint!`;
        }
      } else {
        uploadStatus = `Upload completed with issues: ${result.message}`;
      }
    } catch (error) {
      // Clear the interval on error
      if (elapsedTimeInterval) {
        clearInterval(elapsedTimeInterval);
      }
      
      console.error('Upload failed:', error);
      uploadStatus = 'Upload failed. Please try again.';
      
      // Reset progress on error
      uploadProgress = 0;
      gsap.to('.progress-bar-inner', { 
        width: '0%', 
        duration: 0.5
      });
    } finally {
      isUploading = false;
    }
  }

  function toggleProxy() {
    useProxy = !useProxy;
    // Use GSAP for button state animation
    gsap.to(proxyBtn, { 
      backgroundColor: useProxy ? '#9c27b0' : '#2196F3',
      duration: 0.3 
    });
  }
</script>

<svelte:head>
  <title>Video Recording Test</title>
</svelte:head>

<div class="container">
  <h1>Video Recording Test</h1>
  
  <div class="video-container">
    <video id="preview" autoplay muted playsinline></video>
  </div>
  
  <div class="controls">
    <button id="startBtn" on:click={startRecording}>Start Recording</button>
    <button id="stopBtn" disabled on:click={stopRecording}>Stop & Upload</button>
    <button id="proxyBtn" on:click={toggleProxy}>Toggle Proxy</button>
  </div>
  
  {#if uploadStatus}
    <div class="status-message">
      {uploadStatus}
    </div>
  {/if}
  
  <div class="progress-bar">
    <div class="progress-bar-inner" style="width: 0%"></div>
  </div>
</div>

<style>
  .container {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
  }
  
  h1 {
    text-align: center;
    margin-bottom: 2rem;
  }
  
  .video-container {
    margin-bottom: 1rem;
    border-radius: 8px;
    overflow: hidden;
    background-color: #000;
  }
  
  video {
    width: 100%;
    display: block;
  }
  
  .controls {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-bottom: 1rem;
  }
  
  button {
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    border: none;
    font-weight: bold;
    cursor: pointer;
    transition: background-color 0.3s;
  }
  
  #startBtn {
    background-color: #4CAF50;
    color: white;
  }
  
  #stopBtn {
    background-color: #f44336;
    color: white;
  }
  
  #proxyBtn {
    background-color: #2196F3;
    color: white;
  }
  
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .status-message {
    text-align: center;
    padding: 1rem;
    border-radius: 4px;
    background-color: #f5f5f5;
  }
  
  .progress-bar {
    width: 100%;
    height: 10px;
    background-color: #ddd;
    border-radius: 5px;
    overflow: hidden;
  }
  
  .progress-bar-inner {
    height: 100%;
    background-color: #4CAF50;
  }
</style>
