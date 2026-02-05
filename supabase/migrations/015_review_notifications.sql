-- Migration 015: Add REVIEW_RECEIVED notification type
-- Extends the notifications type check constraint to support review notifications

-- Drop and recreate the check constraint with new type
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'LISTING_CLAIMED',
  'PAYMENT_RECEIVED',
  'DISPUTE_FILED',
  'DELIVERY_RECEIVED',
  'DISPUTE_RESOLVED',
  'WITHDRAWAL_COMPLETED',
  'REVIEW_RECEIVED',
  'SYSTEM'
));
