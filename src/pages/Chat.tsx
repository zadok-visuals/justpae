import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Image, Mic, CheckCheck, ChevronLeft, X } from 'lucide-react';
import { VoiceRecorder } from '@/components/chat/VoiceRecorder';
import { AudioPlayer } from '@/components/chat/AudioPlayer';
import { useChat, ChatMessage } from '@/hooks/useChat';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

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

  // Staging state variables for image previews before manual transmission
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: 'smooth' | 'auto' = 'smooth') => {
    if (scrollContainerRef.current) {
      const { scrollHeight } = scrollContainerRef.current;
      scrollContainerRef.current.scrollTo({
        top: scrollHeight,
        behavior,
      });
    }
  };

  // Clean up object URLs to prevent system memory leaks when component drops
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages]);

  useEffect(() => {
    if (user) {
      const initChat = async () => {
        const conversation = await getOrCreateConversation();
        if (conversation) {
          await fetchMessages(conversation.id);
          await markMessagesAsRead(conversation.id);
          setTimeout(() => scrollToBottom('auto'), 150);
        }
      };
      initChat();
    }
  }, [user, getOrCreateConversation, fetchMessages, markMessagesAsRead]);

  // Combined manual dispatch router for both text and file pipelines
  const handleSendMessage = async () => {
    if (isSending) return;

    // Check if there is a file staged, or text typed
    if (!selectedFile && !messageText.trim()) return;

    setIsSending(true);
    try {
      // 1. If an image file is staged, send it first
      if (selectedFile) {
        await sendFileMessage(selectedFile, 'image');
        handleClearSelectedFile(); // Wipe staging slot instantly
      }

      // 2. If text was also accompanied with it, send it right after
      if (messageText.trim()) {
        await sendMessage(messageText);
        setMessageText('');
      }
    } catch (error) {
      console.error('Failed dispatch sequence:', error);
      toast({
        title: "Message Failed",
        description: "An error occurred while transmitting your payload.",
        variant: "destructive",
      });
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

  const handleBackNavigation = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
  };

  const handleImageUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fileInputRef.current?.click();
  };

  // Stage chosen files locally instead of auto-running hook streams
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Unsupported File Type",
        description: "Please select a valid image format (PNG, JPG, WEBP).",
        variant: "destructive",
      });
      return;
    }

    // Revoke old blob addresses to avoid leaking memory cache blocks
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file)); // Generate browser visual proxy loop
  };

  const handleClearSelectedFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const renderMessage = (message: ChatMessage) => {
    const isCurrentUser = message.sender_id === user?.id;
    const messageTime = formatDistanceToNow(new Date(message.created_at), { addSuffix: true });

    return (
      <div key={message.id} className={`flex flex-col gap-1 mb-4 ${isCurrentUser ? 'items-end' : 'items-start'}`}>
        <div className={`max-w-[85%] sm:max-w-[75%] shadow-sm transition-all ${message.message_type === 'voice'
            ? 'bg-transparent shadow-none'
            : isCurrentUser
              ? 'bg-fintech-orange text-white rounded-2xl rounded-tr-none p-3'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-2xl rounded-tl-none p-3'
          }`}>
          {message.message_type === 'text' && (
            <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">{message.content}</p>
          )}

          {message.message_type === 'image' && message.file_url && (
            <div className="relative rounded-lg overflow-hidden max-w-xs border border-black/5">
              <img
                src={message.file_url}
                alt="Shared attachment"
                className="max-w-full h-auto object-cover hover:opacity-95 transition-opacity cursor-pointer"
                onClick={() => window.open(message.file_url || '', '_blank')}
              />
            </div>
          )}

          {message.message_type === 'voice' && message.file_url && (
            <AudioPlayer
              src={message.file_url}
              timestamp={messageTime}
              isRead={message.is_read}
              isCurrentUser={isCurrentUser}
            />
          )}
        </div>

        {message.message_type !== 'voice' && (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-400 px-1 mt-0.5 select-none">
            <span>{messageTime}</span>
            {isCurrentUser && (
              <CheckCheck className={`w-3.5 h-3.5 ${message.is_read ? 'text-blue-500' : 'text-gray-400'}`} />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white relative">

      {/* Sticky Header Node */}
      <div className="flex-none border-b border-gray-100 dark:border-gray-800 px-4 py-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md z-20 flex items-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          onClick={handleBackNavigation}
          className="rounded-full w-9 h-9 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
        </Button>
        <div className="flex-1 min-w-0 ml-1">
          <h1 className="text-base font-bold text-gray-900 dark:text-white truncate">Support Chat</h1>
          <p className="text-xs text-gray-400 dark:text-gray-400">
            Typical response time: <span className="text-fintech-orange font-semibold">Under 5 mins</span>
          </p>
        </div>
      </div>

      {/* Scroll Container Area */}
      {/* Scroll Container Area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto bg-gray-50/20 dark:bg-gray-800/5 px-4 py-4 scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-gray-400">
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-fintech-orange border-t-transparent rounded-full animate-spin" />
              <span className="text-xs tracking-wide">Loading conversation...</span>
            </div>
          </div>
        ) : messages.length === 0 && !previewUrl ? (
          <div className="flex flex-col items-center justify-center h-full max-w-xs mx-auto text-center opacity-40 select-none">
            <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
              <Send className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-semibold">No messages yet</p>
            <p className="text-xs text-gray-400 mt-0.5">Start the conversation below</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full flex flex-col">
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} className="h-2 shrink-0" />
          </div>
        )}
      </div>

      {/* Bottom Input Console Panel */}
      <div className="shrink-0 p-3 pb-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 z-20">
        <div className="max-w-3xl mx-auto w-full flex flex-col gap-2">

          {/* Staged Image Preview Box: Visible ONLY when image chosen but not sent */}
          {previewUrl && (
            <div className="relative align-middle self-start mb-1 bg-gray-100 dark:bg-gray-800 p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 animate-in zoom-in-95 duration-150">
              <div className="relative max-w-[120px] max-h-[120px] rounded-lg overflow-hidden flex items-center justify-center">
                <img src={previewUrl} alt="Staged upload preview" className="object-cover max-w-full h-24 rounded-lg" />
              </div>
              <Button
                type="button"
                onClick={handleClearSelectedFile}
                disabled={isSending}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-900/80 hover:bg-red-500 rounded-full flex items-center justify-center text-white border border-white/20 p-0 shadow-sm"
              >
                <X className="w-3 h-3 stroke-[3]" />
              </Button>
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* Media Utilities */}
            <div className="flex items-center h-11">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={handleImageUpload}
                disabled={isSending || !!previewUrl}
                className="w-10 h-10 rounded-full text-gray-400 hover:text-fintech-orange hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-30"
              >
                <Image className="w-5 h-5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setShowVoiceRecorder(!showVoiceRecorder)}
                disabled={isSending || !!previewUrl}
                className={`w-10 h-10 rounded-full transition-colors disabled:opacity-30 ${showVoiceRecorder
                    ? "bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400"
                    : "text-gray-400 hover:text-fintech-orange hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
              >
                <Mic className="w-5 h-5" />
              </Button>
            </div>

            {/* Text Area Box */}
            <div className="flex-1 relative flex items-center min-w-0">
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={previewUrl ? "Add caption or hit send..." : "Type your message..."}
                disabled={isSending}
                rows={1}
                className="w-full min-h-[44px] max-h-28 py-3 pl-4 pr-12 rounded-2xl bg-gray-100 dark:bg-gray-800 border-none focus:outline-none focus:ring-2 focus:ring-fintech-orange/10 transition-all text-[15px] text-gray-900 dark:text-white resize-none overflow-y-auto"
              />

              <div className="absolute right-1.5 bottom-1.5">
                <Button
                  type="button"
                  size="icon"
                  onClick={handleSendMessage}
                  disabled={isSending || (!messageText.trim() && !selectedFile)}
                  className={`w-8 h-8 rounded-full shadow-sm transition-all duration-200 flex items-center justify-center ${messageText.trim() || selectedFile
                      ? "bg-fintech-orange scale-100 opacity-100 cursor-pointer"
                      : "bg-gray-200 dark:bg-gray-700 scale-90 opacity-0 pointer-events-none"
                    }`}
                >
                  <Send className="w-3.5 h-3.5 text-white fill-current" />
                </Button>
              </div>
            </div>
          </div>

          {/* Voice Drawer Modal panel */}
          {showVoiceRecorder && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-700 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex justify-between items-center px-1 mb-2">
                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-widest">Voice Memo Panel</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowVoiceRecorder(false)}
                  className="h-5 px-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-white"
                >
                  Cancel
                </Button>
              </div>
              <VoiceRecorder
                onRecordingComplete={(blob) => sendFileMessage(new File([blob], 'voice.webm'), 'voice')}
                disabled={isSending}
              />
            </div>
          )}
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
