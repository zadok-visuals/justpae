-- Fix search_path security issue for the notification function
CREATE OR REPLACE FUNCTION notify_user_of_chat_message()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only create notification if message is from admin to user
  IF NEW.sender_type = 'admin' THEN
    INSERT INTO notifications (
      user_id,
      title,
      message,
      type,
      is_read
    )
    SELECT 
      cc.user_id,
      'New Support Message',
      CASE 
        WHEN NEW.message_type = 'text' THEN COALESCE(SUBSTRING(NEW.content, 1, 100), 'New message from support')
        WHEN NEW.message_type = 'image' THEN '📷 Image from support'
        WHEN NEW.message_type = 'voice' THEN '🎤 Voice message from support'
        ELSE 'New message from support'
      END,
      'info',
      false
    FROM chat_conversations cc
    WHERE cc.id = NEW.conversation_id;
  END IF;
  
  RETURN NEW;
END;
$$;