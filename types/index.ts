export type UserRole = 'client' | 'frontend_dev' | 'backend_dev' | 'store_manager' | 'admin'

export type FixType = 'frontend' | 'backend' | 'unknown'

export type RequestStatus =
  | 'pending'
  | 'ai_processing'
  | 'ai_completed'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  | 'deployed'
  | 'rejected'

export interface Profile {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

export interface Store {
  id: string
  shop_domain: string
  shop_name: string | null
  owner_id: string | null
  store_manager_id: string | null
  shopify_access_token: string | null
  created_at: string
  updated_at: string
  // joins
  owner?: Profile
  store_manager?: Profile
}

export interface FileFix {
  file: string           // e.g. "sections/header.liquid"
  original_content: string
  modified_content: string
  explanation: string
}

export interface BugRequest {
  id: string
  client_id: string
  store_id: string
  contact_email: string
  title: string
  description: string
  fix_type: FixType
  ai_classification_reason: string | null
  status: RequestStatus
  assigned_dev_id: string | null
  ai_fix_suggestion: FileFix[] | null
  approved_fix: FileFix[] | null
  reviewer_notes: string | null
  staging_theme_id: string | null
  staging_theme_name: string | null
  created_at: string
  updated_at: string
  // joins
  client?: Profile
  store?: Store
  assigned_dev?: Profile
}

export interface NotificationLog {
  id: string
  bug_request_id: string
  user_id: string | null
  email_to: string
  notification_type: string
  sent_at: string
}

// Shopify API types
export interface ShopifyTheme {
  id: number
  name: string
  role: 'main' | 'unpublished' | 'demo'
  created_at: string
  updated_at: string
}

export interface ShopifyAsset {
  key: string
  value?: string
  attachment?: string
  content_type: string
  theme_id: number
  updated_at: string
}
