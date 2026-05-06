
export interface GiftCardTransaction {
  id: string;
  user_id: string;
  card_type: string;
  card_value: number;
  image_url: string;
  status: string;
  admin_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  profiles?: {
    name: string;
    email: string;
  };
}
