import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { env } from '../config/env.js';
import { toPublicAssetPath } from '../utils/storage.js';

type ExtractedQuestion = {
  actual_number?: string;
  paragraph?: string;
  question?: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  key?: string;
  topic?: string;
  image_relative_path?: string;
  image_preview_relative_path?: string;
  image_path?: string;
};

type PreprocessPayload = {
  questions: ExtractedQuestion[];
  issues: unknown[];
  tables: unknown[];
};

export async function runPreprocessing(docxPath: string) {
  const documentBase = path.basename(docxPath, path.extname(docxPath)).replace(/[^a-zA-Z0-9_-]+/g, '_');
  const assetDir = path.join(env.storageDir, 'imports', documentBase);
  fs.mkdirSync(assetDir, { recursive: true });

  const payload = await new Promise<PreprocessPayload>((resolve, reject) => {
    const child = spawn(env.preprocessPython, [env.preprocessScript, docxPath, assetDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Preprocessing failed with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as PreprocessPayload);
      } catch (error) {
        reject(error);
      }
    });
  });

  const normalizedQuestions = payload.questions.map((question) => {
    const relativePath = question.image_relative_path
      ? path.join(assetDir, question.image_relative_path)
      : '';
    const relativePreview = question.image_preview_relative_path
      ? path.join(assetDir, question.image_preview_relative_path)
      : '';

    return {
      ...question,
      imageAbsolutePath: relativePath || question.image_path || '',
      imageUrl: relativePath ? toPublicAssetPath(relativePath) : '',
      imagePreviewUrl: relativePreview ? toPublicAssetPath(relativePreview) : '',
    };
  });

  return {
    assetDir,
    questions: normalizedQuestions,
    issues: payload.issues,
    tables: payload.tables,
  };
}
