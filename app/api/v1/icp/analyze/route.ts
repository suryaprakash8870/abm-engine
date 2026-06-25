/**
 * POST /api/v1/icp/analyze — Mode A intake helper.
 *
 * Takes a business website URL or freeform description and returns DRAFT answers
 * for the 12 wizard questions (one Claude call, mock fallback). Interactive +
 * short — the user waits with a spinner — same pattern as the play AI-draft.
 * It does NOT create an ICP; the user reviews the drafts then submits the wizard.
 */

import { resolveWorkspaceId } from '@/lib/auth/workspace';
import { analyzeBusinessToAnswers } from '@/lib/engines/icp-engine/analyze';
import { ok, fail, handleRouteError } from '@/lib/http/respond';

export async function POST(req: Request) {
  try {
    resolveWorkspaceId(req); // auth gate (tenant from session)

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail('VALIDATION_ERROR', 'Request body must be valid JSON.');
    }

    const input = (body as { input?: unknown })?.input;
    if (typeof input !== 'string' || input.trim().length < 3) {
      return fail('VALIDATION_ERROR', 'Provide a website URL or a short description of your business.');
    }
    if (input.length > 4000) {
      return fail('VALIDATION_ERROR', 'That description is too long (max 4000 characters).');
    }

    const answers = await analyzeBusinessToAnswers(input.trim());
    return ok({ answers });
  } catch (e) {
    return handleRouteError(e);
  }
}
