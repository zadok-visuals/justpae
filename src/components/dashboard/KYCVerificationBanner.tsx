
import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface KYCVerificationBannerProps {
  isKycVerified: boolean;
}

const KYCVerificationBanner: React.FC<KYCVerificationBannerProps> = ({
  isKycVerified
}) => {
  if (isKycVerified) return null;

  return (
    <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-2xl p-4">
      <div className="flex items-center space-x-3">
        <div className="text-orange-500 text-xl">⚠️</div>
        <div className="flex-1">
          <h3 className="font-semibold text-orange-800 dark:text-orange-200">Complete your verification</h3>
          <p className="text-sm text-orange-600 dark:text-orange-300">Complete KYC to unlock all features</p>
        </div>
        <Link to="/kyc">
          <Button size="sm" className="bg-fintech-orange hover:bg-fintech-orange/90">
            Verify Now
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default KYCVerificationBanner;
