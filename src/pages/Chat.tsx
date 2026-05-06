
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
import Layout from '@/components/Layout';

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
    } finally {
      setIsSending(false);
    }
  };

  const renderMessage = (message: ChatMessage) => {
    const isCurrentUser = message.sender_id === user?.id;
    const messageTime = formatDistanceToNow(new Date(message.created_at), { addSuffix: true });

    return (
      <div
        key={message.id}
        className={`flex flex-col gap-1 mb-4 ${isCurrentUser ? 'items-end' : 'items-start'}`}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
          <span className="font-medium">{message.sender_name}</span>
          <span>•</span>
          <span>{messageTime}</span>
          {isCurrentUser && (
            <CheckCheck className={`w-3 h-3 ${message.is_read ? 'text-primary' : 'text-muted-foreground'}`} />
          )}
        </div>
        
        <div
          className={`max-w-[85%] sm:max-w-[70%] p-3 rounded-2xl ${
            isCurrentUser
              ? 'bg-primary text-primary-foreground rounded-tr-none shadow-md'
              : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-tl-none shadow-sm border border-gray-100 dark:border-gray-700'
          }`}
        >
          {message.message_type === 'text' && (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
          )}
          
          {message.message_type === 'image' && message.file_url && (
            <img
              src={message.file_url}
              alt="Shared image"
              className="max-w-full h-auto rounded-lg max-h-96 object-cover cursor-pointer"
              loading="lazy"
              onClick={() => window.open(message.file_url || '', '_blank')}
            />
          )}
          
          {message.message_type === 'voice' && message.file_url && (
            <div className="flex flex-col gap-2 w-full min-w-[200px]">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4" />
                <span className="text-xs opacity-75">Voice message</span>
              </div>
              <audio
                controls
                src={message.file_url}
                className="w-full h-8"
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-200px)] bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden my-4">
        {/* Header */}
        <div className="bg-gray-50/50 dark:bg-gray-800/50 backdrop-blur-md border-b px-6 py-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Support Chat</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Our team is here to help you</p>
        </div>

        {/* Messages Area */}
        <ScrollArea className="flex-1 p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-pulse text-sm text-gray-400">Loading your conversation...</div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                  <Send className="w-8 h-8 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-gray-900 dark:text-white">No messages yet</p>
                  <p className="text-sm text-gray-500">Ask us anything about your account or trades.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map(renderMessage)}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t bg-white dark:bg-gray-800 p-4 sm:p-6 space-y-4">
          {/* Image Preview */}
          {imagePreview && (
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
              <div className="flex items-start gap-4">
                <div className="relative group">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-24 h-24 object-cover rounded-lg shadow-md"
                  />
                  <button 
                    onClick={handleCancelImage}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-gray-900 dark:text-white">Send Image</p>
                  <p className="text-xs text-gray-500 mb-3">{selectedImage?.name}</p>
                  <Button
                    size="sm"
                    onClick={handleSendImage}
                    disabled={isSending}
                    className="bg-primary hover:bg-primary/90"
                  >
                    <Send className="w-3 h-3 mr-2" />
                    Send Image
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-end gap-3">
            <div className="flex gap-2 mb-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={handleImageUpload}
                disabled={isSending || !!imagePreview}
                className="rounded-full text-gray-500 hover:text-primary hover:bg-primary/10"
              >
                <Image className="w-5 h-5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowVoiceRecorder(!showVoiceRecorder)}
                disabled={isSending}
                className="rounded-full text-gray-500 hover:text-primary hover:bg-primary/10"
              >
                <Mic className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex-1">
              {showVoiceRecorder ? (
                <VoiceRecorder
                  onRecordingComplete={handleVoiceRecording}
                  disabled={isSending}
                />
              ) : (
                <div className="relative">
                  <Input
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type a message..."
                    disabled={isSending}
                    className="pr-12 py-6 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 rounded-2xl focus-visible:ring-primary"
                  />
                  <Button
                    size="icon"
                    onClick={handleSendMessage}
                    disabled={!messageText.trim() || isSending}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl w-10 h-10 bg-primary hover:bg-primary/90"
                  >
                    <Send className="w-5 h-5" />
                  </Button>
                </div>
              )}
            </div>
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
    </Layout>
  );
};

export default Chat;