"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";

export interface UseWaveSurferOptions {
  url?: string;
  waveColor?: string;
  progressColor?: string;
  cursorColor?: string;
  height?: number;
  barWidth?: number;
  barGap?: number;
  barRadius?: number;
  autoplay?: boolean;
}

export interface UseWaveSurferReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  wavesurfer: WaveSurfer | null;
  isPlaying: boolean;
  isReady: boolean;
  currentTime: number;
  duration: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seekTo: (seconds: number) => void;
  seekToPercent: (percent: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<UseWaveSurferOptions, "url">> = {
  waveColor: "#71716E", // stone
  progressColor: "#0A0A0A", // ink
  cursorColor: "#1E40AF", // accent-blue
  height: 64,
  barWidth: 2,
  barGap: 2,
  barRadius: 1,
  autoplay: false,
};

/**
 * React hook for WaveSurfer.js integration.
 * Provides a ref for the container and controls for playback.
 */
export function useWaveSurfer(options: UseWaveSurferOptions = {}): UseWaveSurferReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy previous instance
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
    }

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: mergedOptions.waveColor,
      progressColor: mergedOptions.progressColor,
      cursorColor: mergedOptions.cursorColor,
      height: mergedOptions.height,
      barWidth: mergedOptions.barWidth,
      barGap: mergedOptions.barGap,
      barRadius: mergedOptions.barRadius,
    });

    wavesurferRef.current = ws;

    // Event listeners
    ws.on("ready", () => {
      setIsReady(true);
      setDuration(ws.getDuration());
      if (mergedOptions.autoplay) {
        ws.play();
      }
    });

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));

    ws.on("audioprocess", () => {
      setCurrentTime(ws.getCurrentTime());
    });

    ws.on("seeking", () => {
      setCurrentTime(ws.getCurrentTime());
    });

    // Load audio if URL provided
    if (mergedOptions.url) {
      ws.load(mergedOptions.url);
    }

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedOptions.url]);

  // Playback controls
  const play = useCallback(() => {
    wavesurferRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    wavesurferRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    wavesurferRef.current?.playPause();
  }, []);

  const seekTo = useCallback((seconds: number) => {
    if (wavesurferRef.current && duration > 0) {
      const percent = Math.max(0, Math.min(1, seconds / duration));
      wavesurferRef.current.seekTo(percent);
    }
  }, [duration]);

  const seekToPercent = useCallback((percent: number) => {
    wavesurferRef.current?.seekTo(Math.max(0, Math.min(1, percent)));
  }, []);

  return {
    containerRef,
    wavesurfer: wavesurferRef.current,
    isPlaying,
    isReady,
    currentTime,
    duration,
    play,
    pause,
    toggle,
    seekTo,
    seekToPercent,
  };
}
