
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      toast({ title: "Invalid file", description: "Please select an image file", variant: "destructive" });
      return;
    }
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSendImage = async () => {
    if (!selectedImage) return;
    setIsSending(true);
    try {
      await sendFileMessage(selectedImage, 'image');
      setSelectedImage(null);
      setImagePreview(null);
    } finally {
      setIsSending(false);
    }
  };

  const renderMessage = (message: ChatMessage) => {
    const isCurrentUser = message.sender_id === user?.id;
    const messageTime = formatDistanceToNow(new Date(message.created_at), { addSuffix: true });

    return (
      <div key={message.id} className={`flex flex-col gap-1 mb-6 ${isCurrentUser ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-2 text-[11px] text-gray-500 px-1 font-medium">
          <span>{message.sender_name}</span>
          <span className="opacity-50">•</span>
          <span>{messageTime}</span>
          {isCurrentUser && (
            <CheckCheck className={`w-3 h-3 ${message.is_read ? 'text-primary' : 'text-gray-400'}`} />
          )}
        </div>
        
        <div className={`max-w-[85%] sm:max-w-[70%] p-4 rounded-3xl ${
          isCurrentUser
            ? 'bg-primary text-white rounded-tr-none shadow-sm'
            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-tl-none border border-gray-100 dark:border-gray-700 shadow-sm'
        }`}>
          {message.message_type === 'text' && <p className="text-[15px] leading-relaxed">{message.content}</p>}
          {message.message_type === 'image' && message.file_url && (
            <img 
              src={message.file_url} 
              alt="Shared" 
              className="max-w-full rounded-2xl cursor-pointer hover:opacity-95 transition-opacity" 
              onClick={() => window.open(message.file_url || '', '_blank')} 
            />
          )}
          {message.message_type === 'voice' && message.file_url && (
            <audio controls src={message.file_url} className="w-full h-10 mt-1" />
          )}
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-140px)] -mx-4 sm:mx-0">
        {/* Simplified Header - Integrated with background */}
        <div className="px-4 py-6">
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Support Chat</h1>
          <p className="text-gray-500 mt-1">Our team is online and ready to help</p>
        </div>

        {/* Seamless Messages Area */}
        <ScrollArea className="flex-1 px-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center">
                <Send className="w-10 h-10 text-primary/30" />
              </div>
              <div className="space-y-1">
                <p className="text-xl font-bold text-gray-900 dark:text-white">No messages yet</p>
                <p className="text-gray-500">How can we assist you today?</p>
              </div>
            </div>
          ) : (
            <div className="pb-4">
              {messages.map(renderMessage)}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        {/* Floating Input Dock */}
        <div className="px-4 pb-6 pt-2">
          <div className="bg-white dark:bg-gray-800 rounded-[2rem] p-2 shadow-lg border border-gray-100 dark:border-gray-700">
            {imagePreview && (
              <div className="p-4 relative">
                <div className="relative inline-block group">
                  <img src={imagePreview} className="w-32 h-32 object-cover rounded-2xl border-2 border-primary/20 shadow-xl" />
                  <button 
                    onClick={() => setImagePreview(null)} 
                    className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-2 shadow-lg hover:bg-red-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <Button 
                    size="sm" 
                    onClick={handleSendImage} 
                    className="mt-3 w-full rounded-xl bg-primary hover:bg-primary/90"
                  >
                    <Send className="w-3 h-3 mr-2" />
                    Send Image
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <Button 
                  size="icon" 
                  variant="ghost" 
                  onClick={handleImageUpload} 
                  className="rounded-full text-gray-400 hover:text-primary hover:bg-primary/10 h-12 w-12"
                >
                  <Image className="w-6 h-6" />
                </Button>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  onClick={() => setShowVoiceRecorder(!showVoiceRecorder)} 
                  className="rounded-full text-gray-400 hover:text-primary hover:bg-primary/10 h-12 w-12"
                >
                  <Mic className="w-6 h-6" />
                </Button>
              </div>
              
              <div className="flex-1 relative">
                {showVoiceRecorder ? (
                  <div className="h-12 flex items-center px-4">
                    <VoiceRecorder 
                      onRecordingComplete={(blob) => sendFileMessage(new File([blob], 'voice.webm'), 'voice')} 
                      disabled={isSending} 
                    />
                  </div>
                ) : (
                  <div className="relative flex items-center">
                    <Input
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Type your message..."
                      className="pr-14 rounded-full bg-gray-50 dark:bg-gray-900 border-none h-14 text-base focus-visible:ring-primary/20"
                    />
                    <Button
                      size="icon"
                      onClick={handleSendMessage}
                      disabled={!messageText.trim() || isSending}
                      className="absolute right-1 w-12 h-12 rounded-full bg-primary hover:bg-primary/90 shadow-md transition-all active:scale-95"
                    >
                      <Send className="w-6 h-6" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
      </div>
    </Layout>
  );
};

export default Chat;