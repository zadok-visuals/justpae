
import React from 'react';
import { Label } from '@/components/ui/label';
import { Upload } from 'lucide-react';

interface GiftCardImageUploadProps {
  uploadedImage: File | null;
  setUploadedImage: (file: File | null) => void;
}

const GiftCardImageUpload: React.FC<GiftCardImageUploadProps> = ({ uploadedImage, setUploadedImage }) => {
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedImage(file);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="gift-card-image" className="text-gray-700 dark:text-gray-300">Gift Card Image</Label>
      <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center">
        <input
          id="gift-card-image"
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        <label htmlFor="gift-card-image" className="cursor-pointer">
          <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            {uploadedImage ? uploadedImage.name : 'Click to upload or drag and drop'}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            PNG, JPG, GIF up to 10MB
          </p>
        </label>
      </div>
      {uploadedImage && (
        <div className="mt-4">
          <img
            src={URL.createObjectURL(uploadedImage)}
            alt="Gift card preview"
            className="max-w-full h-48 object-contain mx-auto rounded-lg border border-gray-200 dark:border-gray-700"
          />
        </div>
      )}
    </div>
  );
};

export default GiftCardImageUpload;
