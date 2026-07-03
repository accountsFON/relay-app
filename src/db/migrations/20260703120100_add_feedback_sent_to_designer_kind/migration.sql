-- New activity kind fired when an AM sends flagged client feedback to the
-- designer (route-feedback-to-designer).
ALTER TYPE "ActivityKind" ADD VALUE IF NOT EXISTS 'feedback_sent_to_designer';
