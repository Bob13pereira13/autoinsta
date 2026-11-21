import { prisma } from "@/lib/db/client";
import { generateReportShareSlug } from "@/lib/reports/share";
import { TRACKED_LINK_ORDER } from "@/lib/tracking/link-order";
import { generateTrackedLinkSlug } from "@/lib/tracking/server";
import { copyMediaFiles, deleteMediaFiles, workspaceMediaUsageBytes, workspaceQuotaBytes } from "@/lib/media/storage";

// Matches the campaign name limit the create and update schemas enforce.
const MAX_NAME_LENGTH = 100;
const COPY_SUFFIX = " copy";

/**
 * Name for a duplicated campaign. The suffix always survives, so a name that
 * already fills the 100 character limit is trimmed to make room for it instead
 * of producing a name the API would reject.
 */
export function buildDuplicateName(name: string): string {
  const suffixed = `${name}${COPY_SUFFIX}`;
  if (suffixed.length <= MAX_NAME_LENGTH) return suffixed;

  const trimmed = name.slice(0, MAX_NAME_LENGTH - COPY_SUFFIX.length).trimEnd();
  return `${trimmed}${COPY_SUFFIX}`;
}

/**
 * Copy a campaign inside its workspace. Returns null when the campaign does
 * not exist in that workspace.
 *
 * The copy is built from the stored row, not from a payload the browser
 * assembles, so every setting comes along, including the ones the campaigns
 * list never loads, and a field added to the model later is copied without
 * anyone having to remember this function.
 *
 * Four things are deliberately not carried over: the copy starts paused so it
 * cannot fire before it has been reviewed, it gets its own report share slug,
 * its tracked links get fresh slugs so click stats stay separate from the
 * original's, and the name gains a "copy" suffix. Media files are copied to
 * new files (so deleting one automation never removes the other's), unless
 * that would exceed the workspace's storage quota — then the copy is made
 * without media and `mediaSkipped` is true.
 */
export async function duplicateCampaign({
  automationId,
  workspaceId,
}: {
  automationId: string;
  workspaceId: string;
}) {
  const source = await prisma.automation.findFirst({
    where: { id: automationId, workspaceId },
    include: {
      trackedLinks: { orderBy: TRACKED_LINK_ORDER },
      media: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
    },
  });

  if (!source) return null;

  // Every setting on the row carries over. The links and media are recreated
  // rather than spread, since they are rows of their own.
  const { trackedLinks, media = [], ...settings } = source;

  let mediaCopies: Array<{ storageKey: string; source: (typeof media)[number] }> = [];
  let mediaSkipped = false;
  if (media.length > 0) {
    const needed = media.reduce((sum, m) => sum + m.sizeBytes, 0);
    if ((await workspaceMediaUsageBytes(workspaceId)) + needed > workspaceQuotaBytes()) {
      mediaSkipped = true;
    } else {
      const keys = await copyMediaFiles(media.map((m) => m.storageKey));
      mediaCopies = keys.map((storageKey, i) => ({ storageKey, source: media[i] }));
    }
  }

  const created = await prisma.automation.create({
    data: {
      ...settings,
      // The rest of the row identifies the original rather than describing it,
      // so the copy is given its own. Passing `undefined` to Prisma leaves a
      // field out of the insert, which is what hands back the column default:
      // a new id, and timestamps of now.
      id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      name: buildDuplicateName(settings.name),
      isActive: false,
      reportShareSlug: generateReportShareSlug(),
      trackedLinks: {
        // Numbered from the order just read, so the copy's buttons match
        // the original's even if the original's positions have gaps or ties.
        create: trackedLinks.map((link, position) => ({
          workspaceId: source.workspaceId,
          slug: generateTrackedLinkSlug(),
          label: link.label,
          destinationUrl: link.destinationUrl,
          position,
        })),
      },
      ...(mediaCopies.length
        ? {
            media: {
              create: mediaCopies.map(({ storageKey, source: m }) => ({
                workspaceId: source.workspaceId,
                slot: m.slot,
                position: m.position,
                kind: m.kind,
                mimeType: m.mimeType,
                sizeBytes: m.sizeBytes,
                storageKey,
                originalName: m.originalName,
              })),
            },
          }
        : {}),
    },
    include: { trackedLinks: true },
  }).catch(async (err) => {
    await deleteMediaFiles(mediaCopies.map((c) => c.storageKey));
    throw err;
  });

  return Object.assign(created, { mediaSkipped });
}
