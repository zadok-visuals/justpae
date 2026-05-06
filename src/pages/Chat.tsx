import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Image, Mic, CheckCheck, X } from 'lucide-react';
import { VoiceRecorder } from '@/components/chat/VoiceRecorder';
import { useChat, ChatMessage } from '@/hooks/useChat';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { formatDistanceToNow } from 'date-fns';

const Chat: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    messages,
    currentConversation,
    loading,
    getOrCreateConversation,
    sendMessage,
    sendFileMessage,
    fetchMessages,
    markMessagesAsRead
  } = useChat();

  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Initialize conversation when page loads
  useEffect(() => {
    if (user) {
      const initChat = async () => {
        const conversation = await getOrCreateConversation();
        if (conversation) {
          await fetchMessages(conversation.id);
          await markMessagesAsRead(conversation.id);
        }
      };
      initChat();
    }
  }, [user, getOrCreateConversation, fetchMessages, markMessagesAsRead]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || isSending) return;

    setIsSending(true);
    try {
      await sendMessage(messageText);
      setMessageText('');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleImageUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast({
        title: "File too large",
        description: "Please select an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    // Set selected image and create preview
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSendImage = async () => {
    if (!selectedImage) return;

    setIsSending(true);
    try {
      await sendFileMessage(selectedImage, 'image');
      toast({
        title: "Image sent",
        description: "Your image has been sent successfully",
      });
      // Clear preview and selected image
      setSelectedImage(null);
      setImagePreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleCancelImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleVoiceRecording = async (audioBlob: Blob) => {
    const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, {
      type: audioBlob.type || 'audio/webm'
    });

    setIsSending(true);
    try {
      await sendFileMessage(audioFile, 'voice');
      setShowVoiceRecorder(false);
      toast({
        title: "Voice note sent",
        description: "Your voice note has been sent successfully",
      });
    } finally {
      setIsSending(false);
    }
  };

  const renderMessage = (message: ChatMessage) => {
    // Client messages on right, admin messages on left
    const isCurrentUser = message.sender_id === user?.id;
    const messageTime = formatDistanceToNow(new Date(message.created_at), { addSuffix: true });

    return (
      <div
        key={message.id}
        className={`flex flex-col gap-1 mb-4 ${isCurrentUser ? 'items-end' : 'items-start'}`}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{message.sender_name}</span>
          <span>•</span>
          <span>{messageTime}</span>
          {isCurrentUser && (
            <CheckCheck className={`w-3 h-3 ${message.is_read ? 'text-primary' : 'text-muted-foreground'}`} />
          )}
        </div>
        
        <div
          className={`max-w-[70%] p-3 rounded-lg ${
            isCurrentUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted'
          }`}
        >
          {message.message_type === 'text' && (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          )}
          
          {message.message_type === 'image' && message.file_url && (
            <img
              src={message.file_url}
              alt="Shared image"
              className="max-w-full h-auto rounded-md max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
              loading="lazy"
              onClick={() => window.open(message.file_url || '', '_blank')}
              onError={(e) => {
                console.error('Failed to load image:', message.file_url);
                const target = e.currentTarget as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  const errorDiv = document.createElement('div');
                  errorDiv.className = 'text-xs text-destructive p-2';
                  errorDiv.textContent = '⚠️ Image failed to load';
                  parent.appendChild(errorDiv);
                }
              }}
            />
          )}
          
          {message.message_type === 'voice' && message.file_url && (
            <div className="flex flex-col gap-2 w-full max-w-[280px]">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4" />
                <span className="text-xs opacity-75">Voice message</span>
              </div>
              <audio
                controls
                src={message.file_url}
                className="w-full h-8"
                preload="metadata"
                onError={(e) => {
                  console.error('Failed to load audio:', message.file_url);
                  const target = e.currentTarget as HTMLAudioElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'text-xs text-destructive';
                    errorDiv.textContent = '⚠️ Audio failed to load';
                    parent.appendChild(errorDiv);
                  }
                }}
              >
                Your browser does not support audio playback.
              </audio>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-background">
      {/* Header */}
      <div className="bg-card border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Support Chat</h1>
        <p className="text-sm text-muted-foreground">Chat with our support team</p>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-muted-foreground">Loading messages...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">No messages yet</p>
              <p className="text-xs text-muted-foreground">Start a conversation with our support team</p>
            </div>
          </div>
        ) : (
          <div className="space-y-0">
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t bg-card p-4 space-y-3">
        {/* Image Preview */}
        {imagePreview && (
          <div className="bg-muted p-3 rounded-lg">
            <div className="flex items-start gap-3">
              <img
                src={imagePreview}
                alt="Preview"
                className="w-20 h-20 object-cover rounded-md"
              />
              <div className="flex-1">
                <p className="text-sm font-medium">Image Preview</p>
                <p className="text-xs text-muted-foreground">
                  {selectedImage?.name}
                </p>
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    onClick={handleSendImage}
                    disabled={isSending}
                  >
                    <Send className="w-3 h-3 mr-1" />
                    Send
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancelImage}
                    disabled={isSending}
                  >
                    <X className="w-3 h-3 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showVoiceRecorder ? (
          <VoiceRecorder
            onRecordingComplete={handleVoiceRecording}
            disabled={isSending}
          />
        ) : (
          <div className="flex gap-2">
            <Input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              disabled={isSending}
              className="flex-1"
            />
            <Button
              size="sm"
              onClick={handleSendMessage}
              disabled={!messageText.trim() || isSending}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        )}
        
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleImageUpload}
            disabled={isSending || !!imagePreview}
          >
            <Image className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowVoiceRecorder(!showVoiceRecorder)}
            disabled={isSending}
          >
            <Mic className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
    </div>
  );
};

export default Chat;