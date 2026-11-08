import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;
const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '1mb' }));

type Tone = 'friendly' | 'professional' | 'short';

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  friendly: 'Rewrite this message to sound friendly, warm, empathetic, and approachable. Keep all facts, names, dates, and details intact. Output only the rewritten message text.',
  professional: 'Rewrite this message to sound professional, polite, articulate, and business-ready. Keep all facts, names, dates, and details intact. Output only the rewritten message text.',
  short: 'Rewrite this message to be short, concise, direct, and to the point. Remove fluff while keeping all essential facts and details intact. Output only the rewritten message text.',
};

// Rewrite endpoint - strictly ephemeral, does not store or save any messages
app.post('/api/rewrite', async (req, res) => {
  try {
    const { message, tone } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Please enter a rough message to rewrite.' });
    }

    if (message.length > 5000) {
      return res.status(400).json({ error: 'Message exceeds 5,000 characters. Please shorten your input.' });
    }

    const validTones: Tone[] = ['friendly', 'professional', 'short'];
    const selectedTone: Tone = validTones.includes(tone) ? tone : 'friendly';

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'Gemini API key is not configured. Please ensure your API key is selected in the Settings > Secrets panel.',
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const instruction = TONE_INSTRUCTIONS[selectedTone];
    const primaryModel = 'gemini-3.8-flash';
    const fallbackModel = 'gemini-3.1-flash-lite';
    const retryDelaysMs = [1000, 2000]; // 1 second after try 1, 2 seconds after try 2
    const ATTEMPT_TIMEOUT_MS = 12000; // 12 second time limit per Gemini attempt

    const makeContentCall = (model: string) =>
      ai.models.generateContent({
        model,
        contents: `Draft to rewrite:
"""
${message.trim()}
"""

Instruction:
${instruction}`,
        config: {
          systemInstruction:
            'You are an expert message rewriter. Output only the final rewritten message. Do not include quotes, headers, preamble, or explanations.',
        },
      });

    const callWithTimeout = (model: string) => {
      let timer: NodeJS.Timeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const timeoutErr: any = new Error(`Request to ${model} timed out after 12 seconds`);
          timeoutErr.isTimeout = true;
          reject(timeoutErr);
        }, ATTEMPT_TIMEOUT_MS);
      });

      return Promise.race([makeContentCall(model), timeoutPromise]).finally(() => {
        clearTimeout(timer);
      });
    };

    let response: any = null;
    let lastError: any = null;

    // Up to 3 tries on the primary model with 12s timeout per try
    for (let tryCount = 1; tryCount <= 3; tryCount++) {
      try {
        console.log(`[${primaryModel}] Try ${tryCount} of 3 starting...`);
        response = await callWithTimeout(primaryModel);
        console.log(`[${primaryModel}] Try ${tryCount} of 3 succeeded.`);
        break;
      } catch (err: any) {
        lastError = err;
        const status = err?.status || err?.statusCode;
        const msg = String(err?.message || '');
        const isTimeout = err?.isTimeout || msg.includes('timed out');
        const isBusy =
          isTimeout ||
          status === 503 ||
          status === 429 ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('high demand');

        if (isTimeout) {
          console.error(`[${primaryModel}] Try ${tryCount} of 3 timed out after 12 seconds.`);
        } else {
          console.error(`[${primaryModel}] Try ${tryCount} of 3 failed:`, err?.message || err);
        }

        if (isBusy && tryCount < 3) {
          const delay = retryDelaysMs[tryCount - 1];
          console.log(`[${primaryModel}] Waiting ${delay / 1000}s before retry ${tryCount + 1}...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else if (!isBusy) {
          // Non-retryable error, fail immediately without retrying
          throw err;
        }
      }
    }

    // If all 3 tries on the primary model fail, try ONE time with fallback Flash-class model (with 12s timeout)
    if (!response && lastError) {
      console.log(`All 3 tries on ${primaryModel} failed. Attempting fallback model ${fallbackModel}...`);
      try {
        response = await callWithTimeout(fallbackModel);
        console.log(`[${fallbackModel}] Fallback try succeeded.`);
      } catch (fallbackErr: any) {
        const isTimeout = fallbackErr?.isTimeout || String(fallbackErr?.message || '').includes('timed out');
        if (isTimeout) {
          console.error(`[${fallbackModel}] Fallback try timed out after 12 seconds.`);
        } else {
          console.error(`[${fallbackModel}] Fallback try failed:`, fallbackErr?.message || fallbackErr);
        }
        throw fallbackErr;
      }
    }

    if (!response && lastError) {
      throw lastError;
    }

    let rewritten = response.text ? response.text.trim() : '';

    // Strip accidental wrapping quotes if the model enclosed the entire output in quotes
    if (
      (rewritten.startsWith('"') && rewritten.endsWith('"')) ||
      (rewritten.startsWith('“') && rewritten.endsWith('”'))
    ) {
      rewritten = rewritten.slice(1, -1).trim();
    }

    if (!rewritten) {
      return res.status(500).json({
        error: 'Unable to generate a rewrite. Please rephrase your message and try again.',
      });
    }

    return res.json({
      rewritten,
      tone: selectedTone,
      originalLength: message.trim().length,
      rewrittenLength: rewritten.length,
    });
  } catch (error: any) {
    console.error('Full Gemini API call error:', error);

    const errorStr = (error?.message || '') + ' ' + (typeof error === 'object' ? JSON.stringify(error) : String(error));
    const status = error?.status || error?.statusCode;

    // Set Content-Type explicitly to application/json
    res.setHeader('Content-Type', 'application/json');

    // Return status 500 or 400 so reverse proxies do not intercept 503/403 into HTML warmup/forbidden pages
    if (
      status === 403 ||
      status === 400 ||
      errorStr.includes('PERMISSION_DENIED') ||
      errorStr.includes('API_KEY_INVALID') ||
      errorStr.includes('insufficient authentication scopes')
    ) {
      return res.status(500).json({
        error: 'Invalid or missing API key. Please check your Gemini API key in the Settings > Secrets panel.',
      });
    }

    if (status === 503 || errorStr.includes('UNAVAILABLE') || errorStr.includes('high demand')) {
      return res.status(500).json({
        error: 'The rewriting service is currently experiencing high demand. Please try again in a few moments.',
      });
    }

    if (status === 429 || errorStr.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({
        error: 'The rewrite service is temporarily busy. Please wait a moment and try again.',
      });
    }

    return res.status(500).json({
      error: 'Something went wrong while rewriting your message. Please try again.',
    });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        port: PORT,
        host: '0.0.0.0',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
