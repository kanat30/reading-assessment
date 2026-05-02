"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useEffect, Suspense, use } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { v4 as uuidv4 } from "uuid";
import { BreathingDot } from "@/components/BreathingDot";
import {
  appendChunk,
  listOrphanedSessions,
  clearSession,
  isIndexedDBAvailable,
} from "@/lib/audio/buffer";
import {
  uploadWithRetry,
  startOfflineRecovery,
  UploadProgress,
  UploadParams,
} from "@/lib/audio/upload";
import { playTick, playError } from "@/lib/audio/sounds";
import { createClient } from "@/lib/supabase/browser";

type RecordingState =
  | "loading"
  | "not-found"
  | "checking-mic"
  | "mic-denied"
  | "ready"
  | "recording"
  | "uploading"
  | "offline"
  | "error";

interface Passage {
  id: string;
  title: string;
  text: string;
  grade_band: string;
  word_count: number;
}

interface Assessment {
  id: string;
  class_label: string;
  share_token: string;
  passages: Passage;
}

interface RecordingPageProps {
  params: Promise<{ token: string }>;
}

const STUDENT_NAME_KEY = "fs:student-name";

function RecordingContent({ token }: { token: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [state, setState] = useState<RecordingState>("loading");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [studentName, setStudentName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null
  );

  // Audio recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkIndexRef = useRef<number>(0);
  const audioSessionIdRef = useRef<string>(uuidv4());
  const cleanupOfflineRef = useRef<(() => void) | null>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const checkMicPermission = async () => {
    try {
      // Check permission status
      const permissionStatus = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });

      if (permissionStatus.state === "denied") {
        setState("mic-denied");
        return;
      }

      if (permissionStatus.state === "granted") {
        setState("ready");
        return;
      }

      // prompt state - we'll show the ready state and ask when they click
      setState("ready");
    } catch {
      // Permissions API not supported, proceed to ready state
      setState("ready");
    }
  };

  const checkOrphanedSessions = async () => {
    if (!isIndexedDBAvailable()) return;

    try {
      const orphaned = await listOrphanedSessions();
      if (orphaned.length > 0) {
        console.log("Found orphaned recording sessions:", orphaned);
        // For now, just log. Could show UI to recover
        // In production, would attempt recovery or clear old sessions
      }
    } catch (e) {
      console.error("Error checking orphaned sessions:", e);
    }
  };

  // Load assessment and student name
  useEffect(() => {
    async function loadAssessment() {
      // Get student name from session storage
      const savedName = sessionStorage.getItem(STUDENT_NAME_KEY);
      if (!savedName) {
        // No name, redirect back to landing
        router.replace(`/read/${token}`);
        return;
      }
      setStudentName(savedName);

      // Fetch assessment
      const { data, error } = await supabase
        .from("assessments")
        .select("*, passages(*)")
        .eq("share_token", token)
        .single();

      if (error || !data) {
        setState("not-found");
        return;
      }

      // Check if expired
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setState("not-found");
        return;
      }

      setAssessment(data);
      checkMicPermission();
    }

    loadAssessment();
    checkOrphanedSessions();

    return () => {
      // Cleanup on unmount
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (cleanupOfflineRef.current) {
        cleanupOfflineRef.current();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Configure MediaRecorder with Opus codec, 1s chunks
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
        audioBitsPerSecond: 24000, // 24kbps as specified
      });

      mediaRecorderRef.current = mediaRecorder;
      chunkIndexRef.current = 0;

      // Generate new session ID for this recording
      audioSessionIdRef.current = uuidv4();

      // Handle incoming chunks
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          const chunkIndex = chunkIndexRef.current++;

          // Store in IndexedDB for resilience
          if (isIndexedDBAvailable()) {
            try {
              await appendChunk(
                audioSessionIdRef.current,
                chunkIndex,
                event.data
              );
            } catch (e) {
              console.error("Error storing chunk:", e);
            }
          }
        }
      };

      // Request data every 1 second
      mediaRecorder.start(1000);
      startTimeRef.current = Date.now();
      setState("recording");

      // Play tick sound
      playTick();

      // Start timer
      timerRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err) {
      console.error("Microphone access error:", err);

      // Check if permission was denied
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setState("mic-denied");
      } else {
        setState("error");
        setErrorMessage(
          "Unable to access microphone. Please check your browser settings."
        );
      }
    }
  };

  const handleStop = async () => {
    if (!mediaRecorderRef.current || state !== "recording" || !assessment) return;

    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setState("uploading");

    const mediaRecorder = mediaRecorderRef.current;
    const durationSeconds = (Date.now() - startTimeRef.current) / 1000;

    // Wait for final data
    await new Promise<void>((resolve) => {
      mediaRecorder.onstop = () => resolve();
      mediaRecorder.stop();
    });

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const uploadParams: UploadParams = {
      audioSessionId: audioSessionIdRef.current,
      assessmentToken: token,
      studentName: studentName,
      durationSeconds: durationSeconds,
    };

    // Upload with retry logic
    const result = await uploadWithRetry(uploadParams, (progress) => {
      setUploadProgress(progress);
    });

    if (result.success && result.sessionId) {
      // Play tick sound (chime will play after comprehension)
      playTick();

      // Navigate to comprehension page
      router.push(`/read/${token}/comprehension?s=${result.sessionId}`);
    } else if (result.isOffline) {
      setState("offline");
      playError();

      // Start offline recovery polling
      cleanupOfflineRef.current = startOfflineRecovery(
        uploadParams,
        (sessionId) => {
          playTick();
          router.push(`/read/${token}/comprehension?s=${sessionId}`);
        },
        (progress) => {
          setUploadProgress(progress);
          if (progress.status === "uploading") {
            setState("uploading");
          }
        }
      );
    } else {
      setState("error");
      playError();
      setErrorMessage(
        result.error || "Something went wrong. Please try again."
      );
    }
  };

  const handleRetry = async () => {
    // Clear old session data
    if (isIndexedDBAvailable()) {
      try {
        await clearSession(audioSessionIdRef.current);
      } catch (e) {
        console.error("Error clearing session:", e);
      }
    }

    // Reset state
    setErrorMessage("");
    setElapsedTime(0);
    setUploadProgress(null);
    audioSessionIdRef.current = uuidv4();
    chunkIndexRef.current = 0;
    setState("ready");
  };

  const handleRefreshPermission = () => {
    // Instructions vary by browser, but user needs to refresh
    window.location.reload();
  };

  // Loading state - passage skeleton
  if (state === "loading") {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-6 py-24">
        <div className="max-w-[680px] w-full">
          <div className="skeleton-shimmer h-4 w-32 rounded mb-8" />
          <div className="space-y-3">
            <div className="skeleton-shimmer h-6 w-full rounded" />
            <div className="skeleton-shimmer h-6 w-full rounded" />
            <div className="skeleton-shimmer h-6 w-11/12 rounded" />
            <div className="skeleton-shimmer h-6 w-full rounded" />
            <div className="skeleton-shimmer h-6 w-10/12 rounded" />
          </div>
        </div>
      </div>
    );
  }

  // Not found / expired state - calm serif design
  if (state === "not-found") {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6">
        <p className="font-serif text-xl text-ink italic text-center">
          This link has expired.
        </p>
        <p className="text-sm text-stone mt-2 text-center">
          Ask your teacher for a new link.
        </p>
      </div>
    );
  }

  // Mic denied state - calm serif design, no warning icon
  if (state === "mic-denied") {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6">
        <p className="font-serif text-xl text-ink italic text-center max-w-md mb-4">
          We need your microphone to hear you read.
        </p>
        <div className="text-sm text-stone text-center max-w-md mb-6 space-y-2">
          <p>To enable your microphone:</p>
          <ol className="text-left list-decimal list-inside space-y-1 inline-block">
            <li>Click the lock icon in your browser&apos;s address bar</li>
            <li>Find &quot;Microphone&quot; and allow access</li>
            <li>Refresh this page</li>
          </ol>
        </div>
        <button
          onClick={handleRefreshPermission}
          className="text-sm text-accent-blue hover:underline"
        >
          Refresh page
        </button>
      </div>
    );
  }

  // Error state - calm serif design, no red icons
  if (state === "error") {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6">
        <p className="font-serif text-xl text-ink italic text-center max-w-md mb-4">
          {errorMessage || "Something went wrong."}
        </p>
        <button
          onClick={handleRetry}
          className="text-sm text-accent-blue hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  // Offline state - calm serif design, no warning icon
  if (state === "offline") {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6">
        <p className="font-serif text-xl text-ink italic text-center max-w-md mb-4">
          You&apos;re offline.
        </p>
        <p className="text-sm text-stone text-center max-w-md">
          Your recording is saved on this device. We&apos;ll upload it when you&apos;re back online.
        </p>
      </div>
    );
  }

  const passage = assessment?.passages;

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <div className="flex-1 flex items-center justify-center px-6 py-24 pb-48">
        <div className="max-w-[680px] w-full">
          {passage && (
            <>
              <p className="text-sm text-stone lowercase tracking-wide mb-8">
                {passage.title.toLowerCase()}
              </p>
              <p className="font-serif text-2xl leading-relaxed text-ink">
                {passage.text}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Fixed bottom control area */}
      <div className="fixed bottom-0 left-0 right-0 bg-paper border-t border-mist">
        <AnimatePresence mode="wait">
          {state === "checking-mic" && (
            <motion.div
              key="checking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center py-6 px-6"
            >
              {/* Pulsing indicator instead of spinner */}
              <div className="w-16 h-16 rounded-full bg-mist flex items-center justify-center mb-4 animate-pulse">
                <div className="w-3 h-3 rounded-full bg-stone" />
              </div>
              <p className="text-base text-ink font-medium">
                Checking microphone...
              </p>
            </motion.div>
          )}

          {state === "ready" && (
            <motion.div
              key="ready"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center py-6 px-6"
            >
              <button
                onClick={handleStartRecording}
                className="w-16 h-16 rounded-full bg-accent-blue cursor-pointer focus:outline-none focus:ring-4 focus:ring-accent-blue/30 transition-transform active:scale-95 flex items-center justify-center"
                aria-label="Start recording"
              >
                <svg
                  className="w-7 h-7 text-paper"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
                </svg>
              </button>
              <p className="mt-4 text-base text-ink font-medium">
                Start recording
              </p>
              <p className="text-sm text-stone">Read the passage aloud</p>
            </motion.div>
          )}

          {state === "recording" && (
            <motion.div
              key="recording"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center py-6 px-6"
            >
              {/* Timer */}
              <p className="text-sm text-stone mb-4 font-mono">
                {formatTime(elapsedTime)}
              </p>

              {/* Stop button with breathing dot effect */}
              <button
                onClick={handleStop}
                className="relative w-16 h-16 rounded-full bg-accent-blue cursor-pointer focus:outline-none focus:ring-4 focus:ring-accent-blue/30 transition-transform active:scale-95"
                aria-label="Stop recording"
              >
                {/* Breathing pulse ring */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <BreathingDot
                    size={64}
                    color="bg-transparent"
                    className="border-2 border-accent-blue/50 absolute"
                  />
                </div>
                {/* Stop square */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-5 h-5 bg-paper rounded-sm" />
                </div>
              </button>

              <p className="mt-4 text-base text-ink font-medium">
                Tap when finished
              </p>
            </motion.div>
          )}

          {state === "uploading" && (
            <motion.div
              key="uploading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center py-6 px-6"
            >
              {/* Pulsing indicator instead of spinner */}
              <div className="w-16 h-16 rounded-full bg-accent-blue/10 flex items-center justify-center mb-4 animate-pulse">
                <div className="w-3 h-3 rounded-full bg-accent-blue" />
              </div>
              <p className="text-base text-ink font-medium">
                {uploadProgress?.message || "Analyzing..."}
              </p>
              {uploadProgress && uploadProgress.status === "retrying" && (
                <p className="text-sm text-stone mt-1">
                  Attempt {uploadProgress.attempt} of {uploadProgress.maxAttempts}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function RecordingPage({ params }: RecordingPageProps) {
  const { token } = use(params);

  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <RecordingContent token={token} />
    </Suspense>
  );
}
