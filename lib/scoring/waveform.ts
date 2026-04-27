/**
 * Extracts visual waveform peaks from an audio buffer.
 *
 * Note: This uses a simplified extraction method that samples raw bytes
 * from the audio data to create a visual fingerprint. It's not acoustically
 * accurate but provides distinctive visual patterns for each recording.
 *
 * For V1, this is sufficient for the mini-waveform fingerprints in the dashboard.
 * A future version could use ffmpeg or a client-side Web Audio API approach
 * for more accurate peak extraction.
 *
 * @param audioBuffer - Raw audio file buffer (webm, mp3, wav, etc.)
 * @param peakCount - Number of peaks to extract (default 200)
 * @returns Array of normalized peak values [0, 1]
 */
export async function extractPeaks(
  audioBuffer: Buffer,
  peakCount: number = 200
): Promise<number[]> {
  try {
    const bufferLength = audioBuffer.length;

    if (bufferLength < 1000) {
      // Audio too short
      return new Array(peakCount).fill(0);
    }

    // Skip header bytes (first ~100 bytes typically contain container metadata)
    const dataStart = Math.min(100, Math.floor(bufferLength * 0.05));
    const dataLength = bufferLength - dataStart;

    // Calculate bytes per bucket
    const bytesPerBucket = Math.floor(dataLength / peakCount);

    if (bytesPerBucket < 1) {
      return new Array(peakCount).fill(0);
    }

    const peaks: number[] = [];
    let maxPeak = 0;

    // Sample byte values to create visual peaks
    for (let i = 0; i < peakCount; i++) {
      const start = dataStart + i * bytesPerBucket;
      const end = Math.min(start + bytesPerBucket, bufferLength);

      // Find max byte value in this range (treating bytes as unsigned)
      let bucketMax = 0;
      for (let j = start; j < end; j += Math.max(1, Math.floor((end - start) / 20))) {
        const byteValue = audioBuffer[j];
        // Convert to amplitude-like value (centered around 128 for unsigned bytes)
        const amplitude = Math.abs(byteValue - 128) / 128;
        if (amplitude > bucketMax) {
          bucketMax = amplitude;
        }
      }

      peaks.push(bucketMax);
      if (bucketMax > maxPeak) {
        maxPeak = bucketMax;
      }
    }

    // Normalize to [0, 1]
    if (maxPeak > 0) {
      for (let i = 0; i < peaks.length; i++) {
        peaks[i] = peaks[i] / maxPeak;
      }
    }

    // Apply some smoothing to make it look more natural
    const smoothed: number[] = [];
    for (let i = 0; i < peaks.length; i++) {
      const prev = i > 0 ? peaks[i - 1] : peaks[i];
      const next = i < peaks.length - 1 ? peaks[i + 1] : peaks[i];
      smoothed.push((prev + peaks[i] * 2 + next) / 4);
    }

    return smoothed;
  } catch (error) {
    console.error("Error extracting waveform peaks:", error);
    // Return empty peaks on error - dashboard will show placeholder
    return new Array(peakCount).fill(0);
  }
}
