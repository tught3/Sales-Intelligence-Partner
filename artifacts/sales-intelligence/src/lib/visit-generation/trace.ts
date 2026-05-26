import type { PipelineTrace, TraceStep } from './types';

export class PipelineTraceBuilder {
  private readonly startedAt = Date.now();
  private readonly steps: TraceStep[] = [];

  constructor(private readonly doctorId: string) {}

  add(stage: string, data: Omit<TraceStep, 'stage' | 'timestamp'> = {}): void {
    this.steps.push({ stage, timestamp: Date.now(), ...data });
  }

  finish(status: PipelineTrace['finalStatus']): PipelineTrace {
    return {
      doctorId: this.doctorId,
      steps: this.steps,
      finalStatus: status,
      totalMs: Date.now() - this.startedAt,
    };
  }
}

export function initTrace(doctorId: string): PipelineTraceBuilder {
  return new PipelineTraceBuilder(doctorId);
}

export function formatTrace(trace: PipelineTrace): string {
  return trace.steps
    .map((step) => {
      const fail = step.failTypes?.length ? ` fail=${step.failTypes.join(',')}` : '';
      const note = step.note ? ` note=${step.note}` : '';
      return `[${step.stage}]${fail}${note}`;
    })
    .join('\n');
}
