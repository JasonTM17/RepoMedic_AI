import os from 'node:os';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { evaluateMutationPolicy } from '../../policy/mutation.js';
import { boundedExec } from '../../process/index.js';
import { SecureFileSystem } from '../../fs/secure-fs.js';
import type { PatchProposal } from '../../domain/entities.js';
import { patchOk, patchFail, type PatchToolResult } from './patch-result.js';

export interface ApplyPatchInput {
  root: string;
  allowlist: readonly string[];
  proposal: PatchProposal;
  approved: boolean;
}

export async function applyPatchTool(input: ApplyPatchInput): Promise<PatchToolResult> {
  const { root, allowlist, proposal, approved } = input;
  
  // Gate every operation through MutationPolicy before touching the filesystem
  for (const op of proposal.operations) {
    const decision = evaluateMutationPolicy(
      { root, allowlist, requireHumanApproval: true },
      op,
      approved,
    );
    if (!decision.allowed) {
      return patchFail(`Policy blocked operation on ${op.path}: ${decision.reason}`);
    }
  }
  
  // Apply hunks that have diff content via git apply
  const hunkedOps = proposal.operations.filter(op => op.hunks && op.hunks.length > 0);
  if (hunkedOps.length > 0) {
    const diffText = hunkedOps.flatMap(op => op.hunks ?? []).join('\n');
    
    const tmpdir = os.tmpdir();
    const tempName = crypto.randomBytes(16).toString('hex') + '.patch';
    const tempPath = path.join(tmpdir, tempName);
    
    try {
      await fs.writeFile(tempPath, diffText, 'utf8');
      const result = await boundedExec('git', ['apply', tempPath], {
        cwd: root,
        timeoutMs: 30_000,
      });
      if (result.exitCode !== 0) {
        return patchFail(`git apply failed: ${result.stderr}`);
      }
    } catch (err) {
      return patchFail(err instanceof Error ? err.message : String(err));
    } finally {
      await fs.unlink(tempPath).catch(() => {});
    }
  }
  
  // Handle create/delete ops via SecureFileSystem
  const sfs = new SecureFileSystem({ root, allowlist });
  for (const op of proposal.operations) {
    if (op.kind === 'create' && (!op.hunks || op.hunks.length === 0)) {
      await sfs.createFile(op.path, '', approved);
    } else if (op.kind === 'delete' && (!op.hunks || op.hunks.length === 0)) {
      await sfs.deleteFile(op.path, approved);
    }
  }
  
  return patchOk(`applied ${proposal.operations.length} operations`);
}
