import type { PatchProposal, Approval } from '../domain/entities.js';
import { approvalSchema } from '../schemas/index.js';

export interface ApprovalCheckpointOptions {
  /**
   * Injectable stdin reader for testing. Defaults to reading from process.stdin.
   * Should return the user's input as a string.
   */
  readLine?: () => Promise<string>;
}

export class ApprovalCheckpoint {
  private readonly readLine: () => Promise<string>;
  
  constructor(options: ApprovalCheckpointOptions = {}) {
    this.readLine = options.readLine ?? defaultReadLine;
  }
  
  /**
   * Presents the proposal summary to the user and waits for approval.
   * Returns an Approval record.
   */
  async requestApproval(proposal: PatchProposal): Promise<Approval> {
    process.stdout.write('\n=== RepoMedic: Human Approval Required ===\n');
    process.stdout.write(`Proposal ID: ${proposal.id}\n`);
    process.stdout.write(`Operations (${proposal.operations.length}):\n`);
    for (const op of proposal.operations) {
      process.stdout.write(`  [${op.kind}] ${op.path}\n`);
    }
    process.stdout.write('\nType "approve" to approve, "reject" to reject: ');
    
    const input = (await this.readLine()).trim().toLowerCase();
    
    const decision = input === 'approve' ? 'approved' : input === 'reject' ? 'rejected' : 'deferred';
    
    const raw = {
      proposalId: proposal.id,
      decidedBy: 'human' as const,
      decision,
      decidedAt: new Date().toISOString(),
      ...(input !== 'approve' && input !== 'reject' ? { reason: `unknown input: ${input}` } : {}),
    };
    
    return approvalSchema.parse(raw);
  }
}

async function defaultReadLine(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (chunk) => {
      data += chunk;
      resolve(data.split('\n')[0] ?? '');
    });
    if (process.stdin.isPaused()) process.stdin.resume();
  });
}
