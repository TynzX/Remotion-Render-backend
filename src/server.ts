import express from 'express';
import { bundle } from '@remotion/bundler';
import { getCompositions, renderMedia } from '@remotion/renderer';
import path from 'path';
import cors from 'cors';
import fs from 'fs/promises';

const app = express();
app.use(express.json());
app.use(cors());

// Create videos directory if it doesn't exist
const VIDEOS_DIR = path.join(process.cwd(), 'videos');
fs.mkdir(VIDEOS_DIR, { recursive: true }).catch(console.error);

// Serve static videos
app.use('/videos', express.static(VIDEOS_DIR));

// Store rendering status
const renderStatus = new Map<string, any>();

// Store composition data temporarily
const compositionDataMap = new Map<string, any>();

app.post('/render-video', async (req, res) => {
  try {
    const compositionData = req.body;
    const jobId = `job-${Date.now()}`;
    
    // Store the composition data
    compositionDataMap.set(jobId, compositionData);

    // Update status to "processing"
    renderStatus.set(jobId, {
      status: 'processing',
      progress: 0,
    });

    // Start rendering process asynchronously
    renderVideo(jobId);

    res.json({
      jobId,
      status: 'processing',
      message: 'Video rendering started',
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      error: 'Failed to start video rendering',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/render-status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const status = renderStatus.get(jobId) || { status: 'not_found' };
  res.json(status);
});

async function renderVideo(jobId: string) {
  try {
    const inputProps = compositionDataMap.get(jobId);
    
    // Add validation
    if (!inputProps) {
      throw new Error('No composition data found for job');
    }

    const bundled = await bundle(path.join(process.cwd(), './src/remotion/index.ts'));
    const compositions = await getCompositions(bundled);
    const composition = compositions.find((c) => c.id === 'MyVideo');

    if (!composition) {
      throw new Error('Composition not found');
    }

    const outputPath = path.join(VIDEOS_DIR, `${jobId}.mp4`);

    console.log('Duration:', inputProps.duration);
    console.log('FPS:', inputProps.fps);
    console.log('Calculated frames:', Math.round(inputProps.duration * inputProps.fps / 1000));

    console.log('Complete inputProps:', JSON.stringify(inputProps, null, 2));
    console.log('Input Props before render:', {
      trackItemIds: inputProps.trackItemIds,
      trackItemsMap: Object.keys(inputProps.trackItemsMap),
      tracks: JSON.stringify(inputProps.tracks, null, 2),
    });

    // Add validation for required properties
    if (!inputProps.tracks || !Array.isArray(inputProps.tracks)) {
      throw new Error('Tracks must be an array');
    }

    if (!inputProps.trackItemsMap || typeof inputProps.trackItemsMap !== 'object') {
      throw new Error('TrackItemsMap must be an object');
    }

    console.log('Final render configuration:', {
      composition: composition.id,
      outputPath,
      inputProps: {
        trackItemIds: inputProps.trackItemIds?.length,
        trackItemsMapKeys: Object.keys(inputProps.trackItemsMap),
        tracksCount: inputProps.tracks?.length,
        fps: inputProps.fps,
        size: inputProps.size,
        duration: inputProps.duration,
        durationInFrames: Math.ceil(inputProps.duration / (1000 / inputProps.fps))
      }
    });

    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps: {
        trackItemIds: inputProps.trackItemIds,
        trackItemsMap: inputProps.trackItemsMap,
        tracks: inputProps.tracks,
        fps: inputProps.fps,
        size: inputProps.size,
        duration: inputProps.duration,
        durationInFrames: Math.ceil(inputProps.duration / (1000 / inputProps.fps)) // Convert ms to frames
      },
      onProgress: ({ progress }) => {
        renderStatus.set(jobId, {
          status: 'processing',
          progress: Math.floor(progress * 100),
        });
      },
    });

    const videoUrl = `/videos/${jobId}.mp4`;
    renderStatus.set(jobId, {
      status: 'complete',
      progress: 100,
      url: videoUrl,
    });

    // Clean up composition data
    compositionDataMap.delete(jobId);

  } catch (error) {
    console.error('Rendering error:', error);
    renderStatus.set(jobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    compositionDataMap.delete(jobId);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});