-- Clear all chat data for fresh start
DELETE FROM chat_messages;
DELETE FROM chat_conversations;

-- Make chat-images bucket public for faster access
UPDATE storage.buckets 
SET public = true 
WHERE id = 'chat-images';

-- Make chat-voice bucket public for faster access  
UPDATE storage.buckets 
SET public = true 
WHERE id = 'chat-voice';

-- Create function to send notification when new chat message arrives
CREATE OR REPLACE FUNCTION notify_user_of_chat_message()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- Create trigger for chat message notifications
DROP TRIGGER IF EXISTS trigger_notify_chat_message ON chat_messages;
CREATE TRIGGER trigger_notify_chat_message
AFTER INSERT ON chat_messages
FOR EACH ROW
EXECUTE FUNCTION notify_user_of_chat_message();