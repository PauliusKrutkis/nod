/**
 * The OS banner sink. Everything here is best-effort by design: the host may
 * refuse the permission, the user may have Do Not Disturb on, and in the demo
 * build there is no host at all. A notification that cannot be delivered is
 * not an error the review flow should ever hear about, so failures resolve
 * quietly and the in-app toast remains the channel that always works.
 *
 * Permission is requested on first use rather than at launch, which means the
 * OS prompt arrives attached to a setting the user just turned on instead of
 * ambushing a first run nobody consented to. The grant is cached for the
 * session because the host call crosses the IPC boundary and the poll can fan
 * out several banners at once.
 */
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let granted: boolean | null = null;

export async function ensureOsPermission(): Promise<boolean> {
  if (granted !== null) {
    return granted;
  }
  try {
    granted =
      (await isPermissionGranted()) ||
      (await requestPermission()) === "granted";
  } catch {
    granted = false;
  }
  return granted;
}

export async function sendOsNotification(
  title: string,
  body: string
): Promise<void> {
  if (!(await ensureOsPermission())) {
    return;
  }
  try {
    await sendNotification({ body, title });
  } catch {
    /* ignore — the in-app toast already carried this */
  }
}
