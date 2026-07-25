interface Window {
  THREE?: any
  supabase?: {
    createClient: (url: string, key: string, options?: Record<string, unknown>) => any
  }
}
