/**
 * Private document storage. Files are stored by an organization-scoped path
 * (`<organizationId>/<id>-<name>`). Access is gated by the application layer:
 * we only fetch a document's bytes after confirming organization membership for
 * its row, so storage paths cannot be used to cross organization boundaries.
 *
 * - LocalStorage: filesystem under STORAGE_DIR (default .storage/). Used in dev/CI.
 * - SupabaseStorage: a private Supabase Storage bucket managed with the
 *   service-role key; object paths are org-scoped.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { config, storageDir } from '../config'
import { createClient } from '@supabase/supabase-js'

export interface Storage {
  upload(storagePath: string, bytes: Buffer, contentType: string): Promise<void>
  download(storagePath: string): Promise<Buffer>
  delete(storagePath: string): Promise<void>
}

const BUCKET = 'company-documents'

class LocalStorage implements Storage {
  private dir = storageDir
  private full(p: string) {
    // Prevent path traversal: resolve within the storage root and verify.
    const root = path.resolve(this.dir)
    const target = path.resolve(root, p)
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error('Invalid storage path')
    }
    return target
  }
  async upload(storagePath: string, bytes: Buffer, _contentType: string) {
    const target = this.full(storagePath)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, bytes)
  }
  async download(storagePath: string) {
    return fs.readFile(this.full(storagePath))
  }
  async delete(storagePath: string) {
    await fs.rm(this.full(storagePath), { force: true })
  }
}

class SupabaseStorage implements Storage {
  private sb = createClient(config.supabase.url, config.supabase.serviceRoleKey, { auth: { persistSession: false } })
  async upload(storagePath: string, bytes: Buffer, contentType: string) {
    const { error } = await this.sb.storage.from(BUCKET).upload(storagePath, bytes, { contentType, upsert: true })
    if (error) throw error
  }
  async download(storagePath: string) {
    const { data, error } = await this.sb.storage.from(BUCKET).download(storagePath)
    if (error || !data) throw error ?? new Error('Download failed')
    return Buffer.from(await data.arrayBuffer())
  }
  async delete(storagePath: string) {
    const { error } = await this.sb.storage.from(BUCKET).remove([storagePath])
    if (error) throw error
  }
}

let instance: Storage | null = null
export function getStorage(): Storage {
  if (instance) return instance
  if (config.database.driver === 'supabase' && config.supabase.serviceRoleKey) {
    instance = new SupabaseStorage()
  } else {
    instance = new LocalStorage()
  }
  return instance
}
