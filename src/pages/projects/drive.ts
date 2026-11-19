/**
 * Pulls a Drive folder ID out of a pasted link such as
 * https://drive.google.com/drive/folders/1AbC...?usp=sharing or
 * https://drive.google.com/drive/u/0/folders/1AbC..., or accepts a bare ID.
 * Returns null if it doesn't look like a folder.
 */
export function driveFolderId(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  const m = s.match(/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|open\?id=)([A-Za-z0-9_-]{10,})/)
  if (m) return m[1]
  // A bare ID: Drive folder IDs are long (usually 33 characters).
  return /^[A-Za-z0-9_-]{25,}$/.test(s) ? s : null
}

export const driveFolderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`
