/**
 * Audio upload with exponential backoff retry logic.
 * Handles network failures gracefully with offline recovery.
 */

import { assembleBlob, clearSession } from "./buffer";

// Retry delays in milliseconds
const RETRY_DELAYS = [1000, 2000, 4000];

// Minimum valid audio blob size (bytes)
// A 1-second WebM/Opus chunk is typically 2-4KB, so 5 seconds of audio should be at least 10KB
const MIN_AUDIO_BLOB_SIZE = 5000;

// Offline polling interval
const OFFLINE_POLL_INTERVAL = 30000; // 30 seconds

export interface UploadResult {
  success: boolean;
  sessionId?: string;
  error?: string;
  isOffline?: boolean;
}

export interface UploadProgress {
  status: "uploading" | "retrying" | "offline" | "success" | "error";
  attempt: number;
  maxAttempts: number;
  message: string;
}

type ProgressCallback = (progress: UploadProgress) => void;

export interface UploadParams {
  audioSessionId: string;
  assessmentToken: string;
  studentName: string;
  durationSeconds: number;
  /** In-memory recording blob. When provided, IndexedDB assembly is skipped
   *  (the recording page keeps chunks in memory — works in incognito). */
  audioBlob?: Blob;
  passageId?: string | null;
  passageIndex?: number;
}

/**
 * Upload audio with retry logic.
 * Returns sessionId on success, or indicates offline status.
 */
export async function uploadWithRetry(
  params: UploadParams,
  onProgress?: ProgressCallback
): Promise<UploadResult> {
  const { audioSessionId, assessmentToken, studentName, durationSeconds } = params;
  const maxAttempts = RETRY_DELAYS.length + 1;

  // Check if online
  if (!navigator.onLine) {
    onProgress?.({
      status: "offline",
      attempt: 0,
      maxAttempts,
      message: "You're offline. We'll save this when you're back online.",
    });
    return { success: false, isOffline: true };
  }

  // Use the in-memory blob when given; otherwise assemble from IndexedDB
  let audioBlob: Blob;
  if (params.audioBlob) {
    audioBlob = params.audioBlob;
  } else {
    try {
      audioBlob = await assembleBlob(audioSessionId);
    } catch (e) {
      console.error("Failed to assemble audio blob:", e);
      return { success: false, error: "Failed to assemble recording" };
    }
  }

  // Validate blob has actual audio data
  if (audioBlob.size < MIN_AUDIO_BLOB_SIZE) {
    console.error(`Audio blob too small: ${audioBlob.size} bytes (minimum: ${MIN_AUDIO_BLOB_SIZE})`);
    return {
      success: false,
      error: "No audio was recorded. Please check your microphone is working and try again."
    };
  }

  // Attempt upload with retries
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    onProgress?.({
      status: attempt === 0 ? "uploading" : "retrying",
      attempt: attempt + 1,
      maxAttempts,
      message: attempt === 0 ? "Uploading..." : `Retrying (${attempt + 1}/${maxAttempts})...`,
    });

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("assessment_token", assessmentToken);
      formData.append("student_name", studentName);
      formData.append("duration_seconds", durationSeconds.toString());
      if (params.passageId) {
        formData.append("passage_id", params.passageId);
        formData.append("passage_index", (params.passageIndex ?? 0).toString());
      }

      const response = await fetch("/api/score", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const { session_id } = await response.json();

        // Clear IndexedDB on success (no-op for in-memory recordings)
        if (!params.audioBlob) {
          await clearSession(audioSessionId);
        }

        onProgress?.({
          status: "success",
          attempt: attempt + 1,
          maxAttempts,
          message: "Upload complete!",
        });

        return { success: true, sessionId: session_id };
      }

      // Server error (4xx, 5xx) - may be worth retrying
      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status}`);
      }

      // Client error (4xx) - don't retry
      const errorText = await response.text();
      return { success: false, error: errorText || "Upload failed" };
    } catch (e) {
      console.error(`Upload attempt ${attempt + 1} failed:`, e);

      // Check if we went offline
      if (!navigator.onLine) {
        onProgress?.({
          status: "offline",
          attempt: attempt + 1,
          maxAttempts,
          message: "You're offline. We'll save this when you're back online.",
        });
        return { success: false, isOffline: true };
      }

      // Wait before retrying (unless this was the last attempt)
      if (attempt < RETRY_DELAYS.length) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
      }
    }
  }

  // All retries exhausted
  onProgress?.({
    status: "error",
    attempt: maxAttempts,
    maxAttempts,
    message: "Upload failed. Your recording is saved locally.",
  });

  return { success: false, error: "All retry attempts failed" };
}

/**
 * Start polling for network recovery and retry upload.
 * Call this when initial upload fails due to offline status.
 */
export function startOfflineRecovery(
  params: UploadParams,
  onSuccess: (sessionId: string) => void,
  onProgress?: ProgressCallback
): () => void {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let isRecovering = false;

  const attemptRecovery = async () => {
    if (isRecovering || !navigator.onLine) return;
    isRecovering = true;

    onProgress?.({
      status: "uploading",
      attempt: 1,
      maxAttempts: 4,
      message: "Back online! Uploading your recording...",
    });

    const result = await uploadWithRetry(params, onProgress);

    if (result.success && result.sessionId) {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      onSuccess(result.sessionId);
    } else if (!result.isOffline) {
      // Real failure, stop polling
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    isRecovering = false;
  };

  // Listen for online event
  const handleOnline = () => {
    attemptRecovery();
  };
  window.addEventListener("online", handleOnline);

  // Also poll periodically
  intervalId = setInterval(() => {
    if (navigator.onLine) {
      attemptRecovery();
    }
  }, OFFLINE_POLL_INTERVAL);

  // Return cleanup function
  return () => {
    window.removeEventListener("online", handleOnline);
    if (intervalId) {
      clearInterval(intervalId);
    }
  };
}

/**
 * Recover orphaned sessions on app mount.
 * Returns list of sessions that need attention.
 */
export async function recoverOrphanedSession(
  params: UploadParams,
  onProgress?: ProgressCallback
): Promise<UploadResult> {
  return uploadWithRetry(params, onProgress);
}
