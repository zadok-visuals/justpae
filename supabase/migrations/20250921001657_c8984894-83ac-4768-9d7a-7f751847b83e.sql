-- Create chat system tables and storage buckets

-- Create chat conversations table
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  admin_id uuid,
  title text DEFAULT 'Support Chat',
  status text DEFAULT 'open' CHECK (status IN ('open', 'closed', 'pending')),
  last_message_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Ensure missing columns exist if table was partially created
ALTER TABLE public.chat_conversations 
  ADD COLUMN IF NOT EXISTS title text DEFAULT 'Support Chat',
  ADD COLUMN IF NOT EXISTS last_message_at timestamp with time zone DEFAULT now();

-- Create chat messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  sender_type text NOT NULL CHECK (sender_type IN ('user', 'admin')),
  message_type text DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'voice', 'file')),
  content text,
  file_url text,
  file_name text,
  file_size integer,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create chat notifications table
CREATE TABLE IF NOT EXISTS public.chat_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chat_conversations
DROP POLICY IF EXISTS "Users can view their own conversations" ON public.chat_conversations;
CREATE POLICY "Users can view their own conversations"
ON public.chat_conversations
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own conversations" ON public.chat_conversations;
CREATE POLICY "Users can create their own conversations"
ON public.chat_conversations
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own conversations" ON public.chat_conversations;
CREATE POLICY "Users can update their own conversations"
ON public.chat_conversations
FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all conversations" ON public.chat_conversations;
CREATE POLICY "Admins can view all conversations"
ON public.chat_conversations
FOR SELECT
USING (public.is_admin_safe(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all conversations" ON public.chat_conversations;
CREATE POLICY "Admins can update all conversations"
ON public.chat_conversations
FOR UPDATE
USING (public.is_admin_safe(auth.uid()));

-- RLS Policies for chat_messages
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.chat_messages;
CREATE POLICY "Users can view messages in their conversations"
ON public.chat_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chat_conversations 
    WHERE id = chat_messages.conversation_id 
    AND user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can insert messages in their conversations" ON public.chat_messages;
CREATE POLICY "Users can insert messages in their conversations"
ON public.chat_messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chat_conversations 
    WHERE id = chat_messages.conversation_id 
    AND user_id = auth.uid()
  )
  AND auth.uid() = sender_id
);

DROP POLICY IF EXISTS "Admins can view all messages" ON public.chat_messages;
CREATE POLICY "Admins can view all messages"
ON public.chat_messages
FOR SELECT
USING (public.is_admin_safe(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert messages in any conversation" ON public.chat_messages;
CREATE POLICY "Admins can insert messages in any conversation"
ON public.chat_messages
FOR INSERT
WITH CHECK (public.is_admin_safe(auth.uid()) AND auth.uid() = sender_id);

DROP POLICY IF EXISTS "Message senders can update their own messages" ON public.chat_messages;
CREATE POLICY "Message senders can update their own messages"
ON public.chat_messages
FOR UPDATE
USING (auth.uid() = sender_id);

-- RLS Policies for chat_notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.chat_notifications;
CREATE POLICY "Users can view their own notifications"
ON public.chat_notifications
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert notifications" ON public.chat_notifications;
CREATE POLICY "System can insert notifications"
ON public.chat_notifications
FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.chat_notifications;
CREATE POLICY "Users can update their own notifications"
ON public.chat_notifications
FOR UPDATE
USING (auth.uid() = user_id);

-- Create storage buckets for chat files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat-images', 'chat-images', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat-voice', 'chat-voice', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for chat images
DROP POLICY IF EXISTS "Users can view chat images" ON storage.objects;
CREATE POLICY "Users can view chat images"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'chat-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can upload chat images" ON storage.objects;
CREATE POLICY "Users can upload chat images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'chat-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Admins can view all chat images" ON storage.objects;
CREATE POLICY "Admins can view all chat images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'chat-images' AND public.is_admin_safe(auth.uid()));

-- Storage policies for chat voice notes
DROP POLICY IF EXISTS "Users can view chat voice notes" ON storage.objects;
CREATE POLICY "Users can view chat voice notes"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'chat-voice' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can upload chat voice notes" ON storage.objects;
CREATE POLICY "Users can upload chat voice notes"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'chat-voice' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Admins can view all chat voice notes" ON storage.objects;
CREATE POLICY "Admins can view all chat voice notes"
ON storage.objects
FOR SELECT
USING (bucket_id = 'chat-voice' AND public.is_admin_safe(auth.uid()));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON public.chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_status ON public.chat_conversations(status);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON public.chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_notifications_user_id ON public.chat_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_notifications_is_read ON public.chat_notifications(is_read);

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_chat_conversations_updated_at ON public.chat_conversations;
CREATE TRIGGER update_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_chat_messages_updated_at ON public.chat_messages;
CREATE TRIGGER update_chat_messages_updated_at
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for chat tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_conversations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_notifications;
  END IF;
END$$;
