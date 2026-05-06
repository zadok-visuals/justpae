
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Image, ExternalLink } from 'lucide-react';

interface GiftCardImageProps {
  imageUrl: string | null;
}

const GiftCardImage: React.FC<GiftCardImageProps> = ({ imageUrl }) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  useEffect(() => {
    if (imageUrl) {
      setImageError(false);
      setImageLoading(true);
    }
  }, [imageUrl]);

  const handleImageError = () => {
    console.error('Image failed to load:', imageUrl);
    setImageError(true);
    setImageLoading(false);
  };

  const handleImageLoad = () => {
    console.log('Image loaded successfully:', imageUrl);
    setImageError(false);
    setImageLoading(false);
  };

  const resetImageState = () => {
    setImageError(false);
    setImageLoading(true);
  };

  return (
    <div>
      <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Gift Card Image</h4>
      <div className="w-full h-64 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 relative">
        {imageUrl ? (
          <>
            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fintech-orange"></div>
              </div>
            )}
            {!imageError && (
              <img
                src={imageUrl}
                alt="Gift Card"
                className="w-full h-full object-contain"
                onLoad={handleImageLoad}
                onError={handleImageError}
                style={{ display: imageLoading ? 'none' : 'block' }}
              />
            )}
            {imageError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 p-4">
                <Image className="w-8 h-8 mb-2" />
                <p className="text-sm text-center">Failed to load image</p>
                <p className="text-xs mt-2 break-all text-center px-2">{imageUrl}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={resetImageState}
                >
                  Retry
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <Image className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">No image available</p>
            </div>
          </div>
        )}
      </div>
      {imageUrl && (
        <div className="mt-2">
          <a
            href={imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm text-fintech-orange hover:text-fintech-orange-dark"
          >
            <ExternalLink className="w-4 h-4 mr-1" />
            View Original Image
          </a>
        </div>
      )}
    </div>
  );
};

export default GiftCardImage;
