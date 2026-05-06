
-- Add missing foreign key for chat_messages sender_id
ALTER TABLE public.chat_messages
ADD CONSTRAINT chat_messages_sender_id_fkey
FOREIGN KEY (sender_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;

-- Add missing foreign key for chat_notifications user_id
ALTER TABLE public.chat_notifications
ADD CONSTRAINT chat_notifications_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;
