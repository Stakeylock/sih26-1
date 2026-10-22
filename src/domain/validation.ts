import { z } from 'zod';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const fileTypes = ['application/pdf', 'image/png', 'image/jpeg'];
export const titleSchema = z.string().trim().min(5, 'Use at least 5 characters.').max(200);
export const institutionSchema = z.object({ name: z.string().trim().min(3).max(200), aicte_ref: z.string().regex(/^DEMO-[A-Z0-9-]{3,40}$/, 'Use a synthetic ID starting DEMO-.'), region: z.enum(['North','South','East','West','Central','North-East']), state: z.string().trim().min(2).max(100) });
export function validateFile(file: Pick<File, 'size' | 'type' | 'name'>) {
  if (!fileTypes.includes(file.type)) throw new Error('Choose a PDF, PNG, or JPEG document.');
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) throw new Error('Documents must be non-empty and no larger than 10 MB.');
  if (file.name.length > 180 || /[\x00-\x1f/\\]/.test(file.name)) throw new Error('Use a simple file name of at most 180 characters.');
}
