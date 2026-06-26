-- Merge design steps: new in-step "Request changes" notify event (AM -> designer).
ALTER TYPE "ActivityKind" ADD VALUE IF NOT EXISTS 'design_changes_requested';
