-- CreateEnum
CREATE TYPE "StoryMediaType" AS ENUM ('IMAGE', 'VIDEO');

-- AlterTable
ALTER TABLE "TravelStory" ADD COLUMN     "mediaType" "StoryMediaType" NOT NULL DEFAULT 'IMAGE',
ADD COLUMN     "mediaUrl" TEXT;

