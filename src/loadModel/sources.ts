/**
 * Where a workbook comes from. The Load model tab only needs the file's name
 * and bytes, so a Google Drive picker can be added later as another source
 * without touching the import itself.
 */
export type WorkbookFile = { name: string; data: ArrayBuffer }

export type WorkbookSource = {
  id: string
  label: string
  /** Resolves to the chosen file, or null if the person cancelled. */
  pick: () => Promise<WorkbookFile | null>
}

export const WORKBOOK_ACCEPT = '.xlsm,.xlsx,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Largest workbook we'll read (the Walnut Creek example is about 3 MB). */
export const MAX_WORKBOOK_BYTES = 25 * 1024 * 1024

/** Reads a File from an <input type="file"> or a drop. */
export async function fromFile(file: File): Promise<WorkbookFile> {
  if (file.size > MAX_WORKBOOK_BYTES) throw new Error('That file is over 25 MB, which is too big for a Region 5 workbook.')
  return { name: file.name, data: await file.arrayBuffer() }
}

/** Upload from this computer. */
export const uploadSource: WorkbookSource = {
  id: 'upload',
  label: 'Upload workbook…',
  pick: () =>
    new Promise((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = WORKBOOK_ACCEPT
      input.onchange = () => {
        const f = input.files?.[0]
        if (!f) return resolve(null)
        fromFile(f).then(resolve, reject)
      }
      input.oncancel = () => resolve(null)
      input.click()
    }),
}

/** Sources shown on the Load model tab. Add Drive here when it is set up. */
export const WORKBOOK_SOURCES: WorkbookSource[] = [uploadSource]
