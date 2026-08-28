-- Organizer roster tools (docs/REMEDIATION.md §8.6 — group-organizer.tsx).
-- Check-in, room allocation, and seat allocation were pure client-side
-- useState with zero backend persistence — silently discarded the next
-- time the member list was refetched from the server. These three nullable
-- columns back the real versions.

-- AlterTable
ALTER TABLE "TripMember" ADD COLUMN     "checkedInAt" TIMESTAMP(3),
ADD COLUMN     "roomAllocated" TEXT,
ADD COLUMN     "seatAllocated" TEXT;
