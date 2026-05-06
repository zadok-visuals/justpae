
export interface Feedback {
  id: string;
  category: string;
  message: string;
  created_at: string;
  user_id: string | null;
  user_email?: string;
  user_name?: string;
}
