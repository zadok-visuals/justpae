
import React from 'react';

const UploadGuidelines: React.FC = () => {
  return (
    <div className="bg-fintech-orange/10 border border-fintech-orange/20 rounded-lg p-4">
      <h3 className="font-semibold text-fintech-orange mb-2">📋 Upload Guidelines</h3>
      <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
        <li>• Upload clear, high-quality images of both front and back</li>
        <li>• Ensure all text and numbers are legible</li>
        <li>• Images should be well-lit and in focus</li>
        <li>• Processing typically takes 1-24 hours</li>
      </ul>
    </div>
  );
};

export default UploadGuidelines;
