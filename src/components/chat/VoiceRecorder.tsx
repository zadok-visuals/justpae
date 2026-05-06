import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Square, Send } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  disabled?: boolean;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onRecordingComplete,
  disabled = false
}) => {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [hasRecording, setHasRecording] = useState(false);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordedBlobRef = useRef<Blob | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Use more compatible audio format
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = ''; // Let browser choose
          }
        }
      }

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mimeType || 'audio/webm' 
        });
        recordedBlobRef.current = audioBlob;
        
        // Create preview URL
        const previewUrl = URL.createObjectURL(audioBlob);
        setAudioPreviewUrl(previewUrl);
        setHasRecording(true);
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      intervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Error",
        description: "Failed to access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isRecording]);

  const sendRecording = useCallback(() => {
    if (hasRecording && recordedBlobRef.current) {
      onRecordingComplete(recordedBlobRef.current);
      
      // Cleanup preview URL
      if (audioPreviewUrl) {
        URL.revokeObjectURL(audioPreviewUrl);
      }
      
      // Reset state
      setHasRecording(false);
      setRecordingTime(0);
      setAudioPreviewUrl(null);
      audioChunksRef.current = [];
      recordedBlobRef.current = null;
    }
  }, [hasRecording, audioPreviewUrl, onRecordingComplete]);

  const cancelRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    }
    
    // Cleanup preview URL
    if (audioPreviewUrl) {
      URL.revokeObjectURL(audioPreviewUrl);
    }
    
    // Reset state
    setHasRecording(false);
    setRecordingTime(0);
    setAudioPreviewUrl(null);
    audioChunksRef.current = [];
    recordedBlobRef.current = null;
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [isRecording, audioPreviewUrl, stopRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (hasRecording) {
    return (
      <div className="flex flex-col gap-2 p-3 bg-muted rounded-lg">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">
            Voice note ({formatTime(recordingTime)})
          </span>
        </div>
        {audioPreviewUrl && (
          <audio
            controls
            src={audioPreviewUrl}
            className="w-full h-8"
            preload="auto"
          >
            Your browser does not support audio playback.
          </audio>
        )}
        <div className="flex gap-2 justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={cancelRecording}
            disabled={disabled}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={sendRecording}
            disabled={disabled}
          >
            <Send className="w-3 h-3 mr-1" />
            Send
          </Button>
        </div>
      </div>
    );
  }

  if (isRecording) {
    return (
      <div className="flex items-center gap-3 p-2.5 bg-destructive/10 rounded-lg">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-2 h-2 bg-destructive rounded-full animate-pulse flex-shrink-0" />
          <span className="text-sm font-medium truncate">
            Recording... {formatTime(recordingTime)}
          </span>
        </div>
        <Button
          size="sm"
          variant="destructive"
          onClick={stopRecording}
          disabled={disabled}
          className="flex-shrink-0"
        >
          <Square className="w-3 h-3" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={startRecording}
      disabled={disabled}
      className="flex items-center gap-2"
    >
      <Mic className="w-4 h-4" />
      Record
    </Button>
  );
};